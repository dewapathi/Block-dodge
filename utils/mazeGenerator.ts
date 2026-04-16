export interface MazeCell {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export type MazeGrid = MazeCell[][];

// ─── Mulberry32 seeded RNG ────────────────────────────────────────────────────
function createRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Recursive-backtracker perfect maze.
 * Pass `seed` for a reproducible maze (same seed → same maze every time).
 * Omit `seed` (or pass undefined) for a random maze.
 */
export function generateMaze(rows: number, cols: number, seed?: number): MazeGrid {
  const rng: () => number = seed !== undefined ? createRng(seed) : Math.random;

  const grid: MazeGrid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      top: true, right: true, bottom: true, left: true,
    }))
  );

  const visited: boolean[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(false)
  );

  type Dir = { dr: number; dc: number; wall: keyof MazeCell; opp: keyof MazeCell };
  const DIRS: Dir[] = [
    { dr: -1, dc: 0, wall: 'top',    opp: 'bottom' },
    { dr:  1, dc: 0, wall: 'bottom', opp: 'top'    },
    { dr:  0, dc:-1, wall: 'left',   opp: 'right'  },
    { dr:  0, dc: 1, wall: 'right',  opp: 'left'   },
  ];

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dfs(r: number, c: number) {
    visited[r][c] = true;
    for (const { dr, dc, wall, opp } of shuffle([...DIRS])) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
        grid[r][c][wall]  = false;
        grid[nr][nc][opp] = false;
        dfs(nr, nc);
      }
    }
  }

  dfs(0, 0);
  return grid;
}

// ─── BFS: shortest solution path length (start=top-left, goal=bottom-right) ──
function bfsPathLength(grid: MazeGrid, rows: number, cols: number): number {
  const dist: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(-1)
  );
  const queue: [number, number][] = [[0, 0]];
  dist[0][0] = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const d = dist[r][c];
    const cell = grid[r][c];

    if (!cell.top    && r > 0       && dist[r-1][c] === -1) { dist[r-1][c] = d+1; queue.push([r-1, c]); }
    if (!cell.bottom && r < rows-1  && dist[r+1][c] === -1) { dist[r+1][c] = d+1; queue.push([r+1, c]); }
    if (!cell.left   && c > 0       && dist[r][c-1] === -1) { dist[r][c-1] = d+1; queue.push([r,   c-1]); }
    if (!cell.right  && c < cols-1  && dist[r][c+1] === -1) { dist[r][c+1] = d+1; queue.push([r,   c+1]); }
  }

  return dist[rows-1][cols-1]; // -1 means unreachable (shouldn't happen in a perfect maze)
}

/**
 * Generate `attempts` mazes and return the one with the LONGEST solution path.
 *
 * Why: A single recursive-backtracker run produces mazes of wildly varying
 * difficulty — sometimes the solution is a short diagonal, sometimes it
 * winds through the whole grid.  By selecting the hardest candidate out of
 * several, we guarantee a genuinely challenging puzzle without changing the
 * core algorithm.
 *
 * For seeded (adventure) mazes the selection is still deterministic: the
 * same seed always produces the same winner because we use seed, seed+P,
 * seed+2P … with a fixed prime stride.
 */
export function generateQualityMaze(
  rows: number,
  cols: number,
  seed: number | undefined,
  attempts: number = 1,
): MazeGrid {
  if (attempts <= 1) return generateMaze(rows, cols, seed);

  const PRIME_STRIDE = 7919; // large prime — spreads seeds across RNG space

  let bestMaze = generateMaze(rows, cols, seed);
  let bestLen  = bfsPathLength(bestMaze, rows, cols);

  for (let i = 1; i < attempts; i++) {
    const s         = seed !== undefined ? seed + i * PRIME_STRIDE : undefined;
    const candidate = generateMaze(rows, cols, s);
    const len       = bfsPathLength(candidate, rows, cols);
    if (len > bestLen) { bestLen = len; bestMaze = candidate; }
  }

  return bestMaze;
}
