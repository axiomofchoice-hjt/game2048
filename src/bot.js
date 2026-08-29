// 自动玩 AI 脚本：编译、快捷校验与默认示例
// 与 React 解耦，独立成文件，便于和组件分开维护。

const VALID_DIRS = ['up', 'down', 'left', 'right']

/** 把脚本返回值规范为一条合法的移动方向 */
export function normalizeDir(r) {
  if (typeof r !== 'string') return null
  const d = r.trim().toLowerCase()
  return VALID_DIRS.includes(d) ? d : null
}

/** 把 tile 棋盘转为数字数组（0 表示空格），供脚本读取与日志展示 */
export function gridToArray(grid) {
  return grid.map((row) => row.map((t) => (t ? t.value : 0)))
}

/**
 * 编译用户脚本为一个运行函数。
 * 支持两种写法：
 *   1) function move(board) { ... return 'up' | ... }
 *   2) 直接写函数体，用 return 返回方向
 *
 * 用一个工厂函数同时覆盖两种写法：若脚本声明了 move / bot，则返回它并调用；
 * 否则直接执行脚本体，把返回值当作方向。
 * @returns {{ run: (board)=>string|null, error?: string }}
 */
export function makeBot(script) {
  const trimmed = (script || '').trim()
  if (!trimmed) return { run: null, error: '脚本为空' }

  let factory
  try {
    factory = new Function(
      'board',
      `"use strict";\n${trimmed}\n;return (typeof move==='function'?move:(typeof bot==='function'?bot:null));`,
    )
  } catch (e) {
    return { run: null, error: String((e && e.message) || e) }
  }

  return {
    run: (board) => {
      const r = factory(board)
      const result = typeof r === 'function' ? r(board) : r
      return typeof result === 'string' ? result : null
    },
    error: null,
  }
}

export const DEFAULT_SCRIPT = `// 2048 自动玩 AI（默认示例）：期望极大（expectimax）策略
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

  // 蛇形权重矩阵：最大块进左上角，并沿“蛇形路径”递减（行内/行间来回走向）
  const W = [
    [65536, 32768, 16384, 8192],
    [512, 1024, 2048, 4096],
    [256, 128, 64, 32],
    [2, 4, 8, 16]
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
