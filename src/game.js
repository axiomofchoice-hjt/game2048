// 2048 核心逻辑（纯函数，与 React 解耦，方便测试）

export const SIZE = 4
const WIN_VALUE = 2048

let uid = 0
const newId = () => ++uid

/** 生成空棋盘的 4x4 二维数组，每个格子为 tile 对象或 null */
export function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
}

function clone(grid) {
  return grid.map((row) => row.slice())
}

/** 返回整个棋盘是否确实发生了变化（仅比较数值） */
function sameGrid(a, b) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((a[r][c]?.value ?? 0) !== (b[r][c]?.value ?? 0)) return false
    }
  }
  return true
}

/** 在当前棋盘的随机空位生成一个新方块（90% 为 2，10% 为 4），返回新棋盘 */
export function addRandomTile(grid) {
  const empties = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) empties.push([r, c])
    }
  }
  if (empties.length === 0) return grid

  const [r, c] = empties[Math.floor(Math.random() * empties.length)]
  const value = Math.random() < 0.9 ? 2 : 4
  const next = clone(grid)
  next[r][c] = { id: newId(), value, isNew: true }
  return next
}

/** 初始棋盘：两个随机方块 */
export function createInitialBoard() {
  return addRandomTile(addRandomTile(emptyGrid()))
}

/** 按移动方向生成所有“线”的坐标（每线内的坐标顺序即前进方向） */
function lineCoords(dir) {
  const lines = []
  const idx = [0, 1, 2, 3]
  if (dir === 'left') {
    for (const r of idx) lines.push(idx.map((c) => [r, c]))
  } else if (dir === 'right') {
    for (const r of idx) lines.push([...idx].reverse().map((c) => [r, c]))
  } else if (dir === 'up') {
    for (const c of idx) lines.push(idx.map((r) => [r, c]))
  } else if (dir === 'down') {
    for (const c of idx) lines.push([...idx].reverse().map((r) => [r, c]))
  }
  return lines
}

/** 对一条线上已按前进方向排好序的方块做滑动+合并 */
function slide(tiles) {
  const out = []
  let score = 0
  let i = 0
  while (i < tiles.length) {
    const t = tiles[i]
    if (i + 1 < tiles.length && tiles[i + 1].value === t.value) {
      const merged = { id: t.id, value: t.value * 2, merged: true }
      out.push(merged)
      score += merged.value
      i += 2 // 合并后的方块不再与下一个合并
    } else {
      out.push({ id: t.id, value: t.value })
      i += 1
    }
  }
  return { tiles: out, score }
}

/**
 * 执行一次移动。
 * @returns {{ grid, moved, score }}
 */
export function move(grid, dir) {
  const next = emptyGrid()
  let score = 0
  for (const line of lineCoords(dir)) {
    const tiles = line.map(([r, c]) => grid[r][c]).filter(Boolean)
    const { tiles: placed, score: s } = slide(tiles)
    score += s
    placed.forEach((t, i) => {
      const [r, c] = line[i]
      next[r][c] = t
    })
  }
  const moved = !sameGrid(grid, next)
  return { grid: next, moved, score }
}

/** 是否已达成 2048 */
export function isWin(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] && grid[r][c].value >= WIN_VALUE) return true
    }
  }
  return false
}

/** 是否还能继续移动（存在空格或有可合并的相邻方块） */
export function canMove(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c]
      if (!t) return true
      const v = t.value
      if (c + 1 < SIZE && grid[r][c + 1]?.value === v) return true
      if (r + 1 < SIZE && grid[r + 1][c]?.value === v) return true
    }
  }
  return false
}

/** 把棋盘展开为带 (row, col) 的方块列表，供渲染 */
export function flattenTiles(grid) {
  const tiles = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c]
      if (t) tiles.push({ ...t, row: r, col: c })
    }
  }
  return tiles
}
