import { useCallback, useEffect, useRef, useState } from 'react'
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

function App() {
  const [grid, setGrid] = useState(createInitialBoard)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest)
  const [status, setStatus] = useState('playing') // 'playing' | 'won' | 'lost'
  const [keepPlaying, setKeepPlaying] = useState(false)

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

  // 触屏滑动
  const touchStart = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return
    if (Math.abs(dx) > Math.abs(dy)) {
      handleMove(dx > 0 ? 'right' : 'left')
    } else {
      handleMove(dy > 0 ? 'down' : 'up')
    }
  }

  const tiles = flattenTiles(grid)
  const gameOver = status === 'lost'
  const showWin = status === 'won' && !keepPlaying
  const showOverlay = gameOver || showWin

  return (
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
        <div className="legend">方向键 / WASD · 或滑动屏幕</div>
      </div>

      <div className="board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
  )
}

export default App
