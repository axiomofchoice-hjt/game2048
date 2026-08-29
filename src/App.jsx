import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInitialBoard,
  move,
  addRandomTile,
  isWin,
  canMove,
  flattenTiles,
} from './game.js'
import { normalizeDir, gridToArray, makeBot, DEFAULT_SCRIPT } from './bot.js'

const KEY_TO_DIR = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

const BEST_KEY = 'game2048.bestScore'

function readBest() {
  const v = Number(localStorage.getItem(BEST_KEY))
  return Number.isFinite(v) ? v : 0
}

function App() {
  const [grid, setGrid] = useState(createInitialBoard)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest)
  const [status, setStatus] = useState('playing') // 'playing' | 'won' | 'lost'
  const [keepPlaying, setKeepPlaying] = useState(false)

  // 脚本 / 自动玩相关状态
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [expanded, setExpanded] = useState(false)
  const [auto, setAuto] = useState(false)
  const [speed, setSpeed] = useState(10) // 1..20
  const [log, setLog] = useState([]) // 每行 { text, ok }
  const logRef = useRef(null)

  const bot = useMemo(() => makeBot(script), [script])
  const botRunRef = useRef(bot.run)
  useEffect(() => {
    botRunRef.current = bot.run
  }, [bot])

  const toggleAuto = useCallback((on) => {
    setAuto(on)
    keepRef.current = on
    setKeepPlaying(on) // 自动玩期间不弹出胜利遮罩
  }, [])

  // 用 ref 保存最新值，避免在 setState 更新函数里产生副作用
  const gridRef = useRef(grid)
  const scoreRef = useRef(0)
  const keepRef = useRef(false)
  const bestRef = useRef(best)

  useEffect(() => {
    gridRef.current = grid
    scoreRef.current = score
    keepRef.current = keepPlaying
    bestRef.current = best
  }, [grid, score, keepPlaying, best])

  const handleMove = useCallback((dir) => {
    const prev = gridRef.current
    const { grid: next, moved, score: gained } = move(prev, dir)
    if (!moved) return

    const withTile = addRandomTile(next)
    const newScore = scoreRef.current + gained

    gridRef.current = withTile
    scoreRef.current = newScore

    setGrid(withTile)
    setScore(newScore)

    if (newScore > bestRef.current) {
      bestRef.current = newScore
      localStorage.setItem(BEST_KEY, String(newScore))
      setBest(newScore)
    }

    if (isWin(withTile) && !keepRef.current) {
      setStatus('won')
    } else if (!canMove(withTile)) {
      setStatus('lost')
    }
  }, [])

  const newGame = useCallback(() => {
    const board = createInitialBoard()
    gridRef.current = board
    scoreRef.current = 0
    setGrid(board)
    setScore(0)
    setStatus('playing')
    setKeepPlaying(false)
  }, [])

  const keepGoing = useCallback(() => {
    keepRef.current = true
    setKeepPlaying(true)
    setStatus('playing')
  }, [])

  // 日志：只保留最近 256 行
  const logLine = useCallback((entry) => {
    setLog((prev) => [...prev, entry].slice(-256))
  }, [])

  const clearLog = useCallback(() => setLog([]), [])

  // 严格模式下运行一步：入参 board，回调结果必须为合法方向且真正改变棋盘
  const step = useCallback(() => {
    const prev = gridRef.current
    const board = gridToArray(prev)
    const input = JSON.stringify(board)
    const runBot = botRunRef.current
    if (!runBot) {
      logLine({ text: `${input} -> 脚本未就绪`, ok: false })
      return false
    }
    let raw = null
    try {
      raw = runBot(board)
    } catch (e) {
      logLine({ text: `${input} -> 脚本异常：${(e && e.message) || e}`, ok: false })
      return false
    }
    const dir = normalizeDir(raw)
    if (!dir) {
      logLine({
        text: `${input} -> 无效${raw == null ? '' : `（"${String(raw)}"）`}`,
        ok: false,
      })
      return false
    }
    const before = gridRef.current
    handleMove(dir)
    if (gridRef.current === before) {
      logLine({ text: `${input} -> ${dir}（无法移动）`, ok: false })
      return false
    }
    logLine({ text: `${input} -> ${dir}`, ok: true })
    return true
  }, [handleMove, logLine])

  // 日志自动滚动到底部
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  // 键盘控制
  useEffect(() => {
    const onKey = (e) => {
      const dir = KEY_TO_DIR[e.key]
      if (!dir) return
      e.preventDefault()
      handleMove(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleMove])

  // 自动执行：严格模式，回调必须返回合法方向且真正移动；无效立即停止
  useEffect(() => {
    if (!auto) return
    const delay = Math.max(50, Math.round(1000 / speed))
    const id = setInterval(() => {
      const ok = step()
      if (!ok) setAuto(false)
    }, delay)
    return () => clearInterval(id)
  }, [auto, speed, step])

  // 鼠标 / 触屏 / 手写笔统一用 Pointer Events 识别滑动
  const swipeStart = useRef(null)

  const onPointerDown = (e) => {
    if (e.button !== 0) return // 只响应鼠标左键 / 触摸 / 笔
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e) => {
    if (!swipeStart.current) return
    const dx = e.clientX - swipeStart.current.x
    const dy = e.clientY - swipeStart.current.y
    swipeStart.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return
    if (Math.abs(dx) > Math.abs(dy)) {
      handleMove(dx > 0 ? 'right' : 'left')
    } else {
      handleMove(dy > 0 ? 'down' : 'up')
    }
  }

  const onPointerCancel = () => {
    swipeStart.current = null
  }

  const tiles = flattenTiles(grid)
  const gameOver = status === 'lost'
  const showWin = status === 'won' && !keepPlaying
  const showOverlay = gameOver || showWin

  return (
    <div className="layout">
      <div className="g-col">
        <div className="game">
          <header className="head">
            <h1 className="title">2048</h1>
            <div className="scores">
              <div className="score-box">
                <span className="score-label">得分</span>
                <span className="score-value">{score}</span>
              </div>
              <div className="score-box">
                <span className="score-label">最高</span>
                <span className="score-value">{best}</span>
              </div>
            </div>
          </header>

          <p className="intro">
            合并相同的数字，争取得到 <strong>2048</strong>！
          </p>

          <div className="controls-row">
            <button className="btn" onClick={newGame}>
              新游戏
            </button>
            <button className="btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? '收起脚本' : '展开脚本'}
            </button>
            <div className="legend">方向键 / WASD · 或鼠标 / 手指滑动</div>
          </div>

          <div
            className="board"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <div className="grid">
              {Array.from({ length: 16 }).map((_, i) => (
                <div className="cell" key={i} />
              ))}
            </div>

            {tiles.map((t) => (
              <div
                key={t.id}
                className={`tile tile-${t.value} tile-f${String(t.value).length}${
                  t.isNew ? ' tile-new' : ''
                }${t.merged ? ' tile-merged' : ''}`}
                style={{ '--row': t.row, '--col': t.col }}
              >
                <span className="tile-inner">{t.value}</span>
              </div>
            ))}

            {showOverlay && (
              <div className="overlay">
                <div className="overlay-text">{gameOver ? '游戏结束' : '你赢了！'}</div>
                <div className="overlay-sub">
                  {gameOver ? `最终得分 ${score}` : '恭喜达成 2048！'}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={gameOver ? newGame : keepGoing}
                >
                  {gameOver ? '再来一局' : '继续挑战'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`s-col${expanded ? ' open' : ''}`}>
        <div className="panel">
          <div className="panel-head">
            <label className="switch-field">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => toggleAuto(e.target.checked)}
                />
                <span className="track" />
              </span>
              <span className="field-label">自动执行</span>
            </label>

            <label className="speed-field">
              <span className="field-label">调速</span>
              <input
                type="range"
                min={1}
                max={20}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span className="speed-val">{speed}</span>
            </label>

            <button className="btn" onClick={step} disabled={!bot.run}>
              运行一步
            </button>
          </div>

          <div className="panel-body">
            <p className="hint-line">
              入参 <code>board</code>：4×4 数组，<code>0</code> 表示空格。
            </p>
            <p className="hint-line">
              返回 <code>'up'</code> / <code>'down'</code> / <code>'left'</code> /{' '}
              <code>'right'</code>。
            </p>
            <p className={`stat${bot.error ? ' stat-err' : ''}`}>
              {bot.error ? `脚本错误：${bot.error}` : '脚本已就绪'}
            </p>
            <textarea
              className="script-area"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              spellCheck={false}
              placeholder="在此粘贴 / 编辑你的 AI 脚本…"
            />
          </div>

          <div className="log-wrap">
            <div className="log-head">
              <span className="log-title">日志（最近 {log.length} / 256 行）</span>
              <button className="btn btn-mini" onClick={clearLog}>
                清空
              </button>
            </div>
            <div className="log-area" ref={logRef}>
              {log.length === 0 ? (
                <div className="log-empty">
                  暂无日志。运行一步或开启自动执行后，这里会记录每次的输入与输出。
                </div>
              ) : (
                log.map((l, i) => (
                  <div key={i} className={`log-line${l.ok ? '' : ' log-err'}`}>
                    {l.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
