// 2048 核心逻辑（纯函数，与 React 解耦，方便测试）

export const SIZE = 4
const WIN_VALUE = 2048

/** 棋盘上的一个方块 */
export interface Tile {
  id: number
  value: number
  /** 本回合是否为新生成的方块（用于入场动画） */
  isNew?: boolean
  /** 本回合是否由两个方块合并而来（用于合并动画） */
  merged?: boolean
}

/** 4×4 棋盘，null 表示空格 */
export type Grid = (Tile | null)[][]

/** 移动方向 */
export type Direction = 'up' | 'down' | 'left' | 'right'

/** 渲染用：带有行列坐标的方块 */
export type PositionedTile = Tile & { row: number; col: number }

/** 一次移动的结果 */
export interface MoveResult {
  grid: Grid
  moved: boolean
  score: number
}

let uid = 0
const newId = (): number => ++uid

/** 生成空棋盘的 4x4 二维数组，每个格子为 tile 对象或 null */
export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null))
}

function clone(grid: Grid): Grid {
  return grid.map((row) => row.slice())
}

/** 读取一个格子，越界视为空格 */
function getTile(grid: Grid, r: number, c: number): Tile | null {
  return grid[r]?.[c] ?? null
}

/** 写入一个格子（坐标保证合法） */
function setTile(grid: Grid, r: number, c: number, tile: Tile): void {
  const row = grid[r]
  if (row) row[c] = tile
}

/** 返回整个棋盘是否确实发生了变化（仅比较数值） */
function sameGrid(a: Grid, b: Grid): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((getTile(a, r, c)?.value ?? 0) !== (getTile(b, r, c)?.value ?? 0)) return false
    }
  }
  return true
}

/** 在当前棋盘的随机空位生成一个新方块（90% 为 2，10% 为 4），返回新棋盘 */
export function addRandomTile(grid: Grid): Grid {
  const empties: [number, number][] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!getTile(grid, r, c)) empties.push([r, c])
    }
  }
  if (empties.length === 0) return grid

  const [r, c] = empties[Math.floor(Math.random() * empties.length)]!
  const value = Math.random() < 0.9 ? 2 : 4
  const next = clone(grid)
  setTile(next, r, c, { id: newId(), value, isNew: true })
  return next
}

/** 初始棋盘：两个随机方块 */
export function createInitialBoard(): Grid {
  return addRandomTile(addRandomTile(emptyGrid()))
}

/** 按移动方向生成所有“线”的坐标（每线内的坐标顺序即前进方向） */
function lineCoords(dir: Direction): [number, number][][] {
  const lines: [number, number][][] = []
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
function slide(tiles: Tile[]): { tiles: Tile[]; score: number } {
  const out: Tile[] = []
  let score = 0
  let i = 0
  while (i < tiles.length) {
    const t = tiles[i]!
    if (i + 1 < tiles.length && tiles[i + 1]!.value === t.value) {
      const merged: Tile = { id: t.id, value: t.value * 2, merged: true }
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

/** 执行一次移动 */
export function move(grid: Grid, dir: Direction): MoveResult {
  const next = emptyGrid()
  let score = 0
  for (const line of lineCoords(dir)) {
    const tiles = line
      .map(([r, c]) => getTile(grid, r, c))
      .filter((t): t is Tile => t != null)
    const { tiles: placed, score: s } = slide(tiles)
    score += s
    placed.forEach((t, i) => {
      const [r, c] = line[i]!
      setTile(next, r, c, t)
    })
  }
  const moved = !sameGrid(grid, next)
  return { grid: next, moved, score }
}

/** 是否已达成 2048 */
export function isWin(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = getTile(grid, r, c)
      if (t && t.value >= WIN_VALUE) return true
    }
  }
  return false
}

/** 是否还能继续移动（存在空格或有可合并的相邻方块） */
export function canMove(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = getTile(grid, r, c)
      if (!t) return true
      const v = t.value
      if (c + 1 < SIZE && getTile(grid, r, c + 1)?.value === v) return true
      if (r + 1 < SIZE && getTile(grid, r + 1, c)?.value === v) return true
    }
  }
  return false
}

/** 把棋盘展开为带 (row, col) 的方块列表，供渲染 */
export function flattenTiles(grid: Grid): PositionedTile[] {
  const tiles: PositionedTile[] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = getTile(grid, r, c)
      if (t) tiles.push({ ...t, row: r, col: c })
    }
  }
  return tiles
}
