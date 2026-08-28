import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInitialBoard,
  move,
  addRandomTile,
  isWin,
  canMove,
  flattenTiles,
} from './game.js'

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

const VALID_DIRS = ['up', 'down', 'left', 'right']

// 把脚本规范为一条合法的移动方向
function normalizeDir(r) {
  if (typeof r !== 'string') return null
  const d = r.trim().toLowerCase()
  return VALID_DIRS.includes(d) ? d : null
}

function gridToArray(grid) {
  return grid.map((row) => row.map((t) => (t ? t.value : 0)))
}

/**
 * 编译用户脚本为一个运行函数。
 * 支持两种写法：
 *   1) function move(board) { ... return 'up' | ... }
 *   2) 直接写函数体，用 return 返回方向
 * @returns {{ run: (board)=>string|null, error?: string }}
 */
function makeBot(script) {
  const trimmed = (script || '').trim()
  if (!trimmed) return { run: null, error: '脚本为空' }

  let body
  try {
    body = new Function('board', `"use strict";\n${trimmed}`)
  } catch (e) {
    return { run: null, error: String((e && e.message) || e) }
  }

  let declared = null
  try {
    const loader = new Function(
      `"use strict";\n${trimmed}\n;return (typeof move==='function'?move:(typeof bot==='function'?bot:null));`,
    )
    const loaded = loader()
    if (typeof loaded === 'function') declared = loaded
  } catch (e) {
    /* 忽略：运行时错误在 tick 里处理 */
  }

  return {
    run: (board) => {
      const r = declared ? declared(board) : body(board)
      return typeof r === 'string' ? r : null
    },
    error: null,
  }
}

const DEFAULT_SCRIPT = `// 2048 自动玩 AI（默认示例）：期望极大（expectimax）策略
// 入参 board：4x4 数组（0 表示空格）
// 返回 'up' | 'down' | 'left' | 'right'
// 启发式：引导最大块进入左上角并保持“蛇形”递减，同时鼓励保留空格

function move(board) {
  const SIZE = 4;
  const DEPTH = 3;

  function slide(line) {
    const a = line.filter(function (v) { return v !== 0; });
    const out = [];
    for (let i = 0; i < a.length; i++) {
      if (i + 1 < a.length && a[i] === a[i + 1]) { out.push(a[i] * 2); i++; }
      else out.push(a[i]);
    }
    while (out.length < SIZE) out.push(0);
    return out;
  }

  function moveGrid(g, dir) {
    const n = SIZE;
    const lines = [];
    if (dir === 'left') for (let r = 0; r < n; r++) lines.push(g[r].slice());
    else if (dir === 'right') for (let r = 0; r < n; r++) lines.push(g[r].slice().reverse());
    else if (dir === 'up') for (let c = 0; c < n; c++) lines.push([0, 1, 2, 3].map(function (r) { return g[r][c]; }));
    else for (let c = 0; c < n; c++) lines.push([3, 2, 1, 0].map(function (r) { return g[r][c]; }));
    const slid = lines.map(slide);
    const ng = g.map(function () { return Array(n).fill(0); });
    if (dir === 'left') for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) ng[r][c] = slid[r][c];
    else if (dir === 'right') for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) ng[r][c] = slid[r][3 - c];
    else if (dir === 'up') for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) ng[r][c] = slid[c][r];
    else for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) ng[r][c] = slid[c][3 - r];
    let moved = false;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] !== ng[r][c]) moved = true;
    return { grid: ng, moved: moved };
  }

  function emptyCells(g) {
    const e = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!g[r][c]) e.push([r, c]);
    return e;
  }

  function gameOver(g) {
    if (emptyCells(g).length) return false;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = g[r][c];
      if (c + 1 < SIZE && g[r][c + 1] === v) return false;
      if (r + 1 < SIZE && g[r + 1][c] === v) return false;
    }
    return true;
  }

  // 权重矩阵：引导最大块进入左上角，整体沿“蛇形”递减
  const W = [
    [65536, 32768, 16384, 8192],
    [32768, 16384, 8192, 4096],
    [16384, 8192, 4096, 2048],
    [8192, 4096, 2048, 1024]
  ];

  function evaluate(g) {
    let h = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = g[r][c];
      if (v) h += v * W[r][c];
    }
    h += emptyCells(g).length * 4000; // 鼓励保留空格
    return h;
  }

  function expectimax(g, depth, chance) {
    if (depth <= 0 || gameOver(g)) return evaluate(g);
    if (!chance) {
      let best = -Infinity;
      const dirs = ['up', 'down', 'left', 'right'];
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        const res = moveGrid(g, d);
        if (!res.moved) continue;
        const v = expectimax(res.grid, depth - 1, true);
        if (v > best) best = v;
      }
      return best === -Infinity ? evaluate(g) : best;
    }
    const empties = emptyCells(g);
    if (empties.length === 0) return evaluate(g);
    const p = 1 / empties.length;
    let total = 0;
    for (let i = 0; i < empties.length; i++) {
      const ec = empties[i];
      for (let v = 2; v <= 4; v *= 2) {
        const prob = v === 2 ? 0.9 : 0.1;
        const ng = g.map(function (row) { return row.slice(); });
        ng[ec[0]][ec[1]] = v;
        total += prob * p * expectimax(ng, depth - 1, false);
      }
    }
    return total;
  }

  let best = -Infinity, bestDir = 'left';
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const res = moveGrid(board, d);
    if (!res.moved) continue;
    const v = expectimax(res.grid, DEPTH - 1, true);
    if (v > best) { best = v; bestDir = d; }
  }
  return bestDir;
}
`

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
  }, [grid])
  useEffect(() => {
    scoreRef.current = score
  }, [score])
  useEffect(() => {
    keepRef.current = keepPlaying
  }, [keepPlaying])
  useEffect(() => {
    bestRef.current = best
  }, [best])

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
                className={`tile tile-${t.value}${t.isNew ? ' tile-new' : ''}${
                  t.merged ? ' tile-merged' : ''
                }`}
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
