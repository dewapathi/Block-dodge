export interface MazeCell {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export type MazeGrid = MazeCell[][];

/** Recursive-backtracker (DFS) perfect maze generator */
export function generateMaze(rows: number, cols: number): MazeGrid {
  const grid: MazeGrid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      top: true,
      right: true,
      bottom: true,
      left: true,
    }))
  );

  const visited: boolean[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(false)
  );

  type Dir = { dr: number; dc: number; wall: keyof MazeCell; opp: keyof MazeCell };
  const DIRS: Dir[] = [
    { dr: -1, dc: 0, wall: 'top', opp: 'bottom' },
    { dr: 1, dc: 0, wall: 'bottom', opp: 'top' },
    { dr: 0, dc: -1, wall: 'left', opp: 'right' },
    { dr: 0, dc: 1, wall: 'right', opp: 'left' },
  ];

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dfs(r: number, c: number) {
    visited[r][c] = true;
    for (const { dr, dc, wall, opp } of shuffle([...DIRS])) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
        grid[r][c][wall] = false;
        grid[nr][nc][opp] = false;
        dfs(nr, nc);
      }
    }
  }

  dfs(0, 0);
  return grid;
}
