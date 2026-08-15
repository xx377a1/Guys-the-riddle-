/**
 * Arrow Flow Puzzle - Level Data & Generator
 * Contains handcrafted introductory levels and a deterministic puzzle generator
 * that produces 100% solvable puzzles for levels 1 through 100.
 */

// Mulberry32 deterministic PRNG
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Handcrafted introductory levels for smooth learning curve
const HANDCRAFTED_LEVELS = {
  1: {
    rows: 3,
    cols: 3,
    arrows: [
      { id: 1, r: 0, c: 1, dir: 'up', color: 'cyan' },
      { id: 2, r: 1, c: 2, dir: 'right', color: 'purple' },
      { id: 3, r: 2, c: 1, dir: 'down', color: 'amber' }
    ]
  },
  2: {
    rows: 3,
    cols: 3,
    arrows: [
      { id: 1, r: 0, c: 1, dir: 'right', color: 'purple' },
      { id: 2, r: 0, c: 2, dir: 'up', color: 'cyan' },
      { id: 3, r: 1, c: 1, dir: 'up', color: 'pink' }, // Blocked by arrow 1 initially
      { id: 4, r: 2, c: 1, dir: 'down', color: 'amber' }
    ]
  },
  3: {
    rows: 4,
    cols: 4,
    arrows: [
      { id: 1, r: 0, c: 0, dir: 'left', color: 'pink' },
      { id: 2, r: 0, c: 2, dir: 'up', color: 'cyan' },
      { id: 3, r: 1, c: 2, dir: 'up', color: 'emerald' }, // Blocked by 2
      { id: 4, r: 2, c: 2, dir: 'right', color: 'purple' },
      { id: 5, r: 3, c: 1, dir: 'down', color: 'amber' }
    ]
  },
  4: {
    rows: 4,
    cols: 4,
    arrows: [
      { id: 1, r: 1, c: 3, dir: 'right', color: 'purple' },
      { id: 2, r: 1, c: 1, dir: 'right', color: 'pink' }, // Blocked by 1
      { id: 3, r: 2, c: 1, dir: 'up', color: 'cyan' },    // Blocked by 2
      { id: 4, r: 3, c: 1, dir: 'down', color: 'amber' },
      { id: 5, r: 0, c: 2, dir: 'up', color: 'emerald' },
      { id: 6, r: 2, c: 3, dir: 'down', color: 'purple' }
    ]
  },
  5: {
    rows: 4,
    cols: 4,
    arrows: [
      { id: 1, r: 0, c: 1, dir: 'left', color: 'pink' },
      { id: 2, r: 0, c: 3, dir: 'up', color: 'cyan' },
      { id: 3, r: 1, c: 1, dir: 'up', color: 'emerald' },  // Blocked by 1
      { id: 4, r: 1, c: 2, dir: 'right', color: 'purple' },
      { id: 5, r: 2, c: 2, dir: 'up', color: 'amber' },   // Blocked by 4
      { id: 6, r: 3, c: 0, dir: 'down', color: 'cyan' },
      { id: 7, r: 3, c: 2, dir: 'down', color: 'pink' }
    ]
  }
};

const COLOR_PALETTES = ['cyan', 'purple', 'amber', 'emerald', 'pink', 'indigo'];
const DIRECTIONS = ['up', 'down', 'left', 'right'];

const DIR_VECTORS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 }
};

/**
 * Deterministically generates a solvable puzzle for any level index using Reverse Construction.
 */
function generateDeterministicLevel(levelNum) {
  if (HANDCRAFTED_LEVELS[levelNum]) {
    const level = JSON.parse(JSON.stringify(HANDCRAFTED_LEVELS[levelNum]));
    level.targetMoves = level.arrows.length;
    return level;
  }

  // Seeded PRNG for levelNum
  const rng = mulberry32(levelNum * 1234567 + 891011);

  // Determine grid size and arrow count based on difficulty progression
  let rows = 4;
  let cols = 4;
  let arrowCount = 6;

  if (levelNum <= 10) {
    rows = 4; cols = 4; arrowCount = 5 + Math.floor(rng() * 2);
  } else if (levelNum <= 30) {
    rows = 4 + (rng() > 0.5 ? 1 : 0);
    cols = 4 + (rng() > 0.5 ? 1 : 0);
    arrowCount = 7 + Math.floor((levelNum - 10) * 0.25) + Math.floor(rng() * 2);
  } else if (levelNum <= 60) {
    rows = 5;
    cols = 5;
    arrowCount = 11 + Math.floor((levelNum - 30) * 0.25) + Math.floor(rng() * 3);
  } else if (levelNum <= 80) {
    rows = 6;
    cols = 6;
    arrowCount = 17 + Math.floor((levelNum - 60) * 0.25) + Math.floor(rng() * 3);
  } else {
    // 81 - 100 Expert
    rows = 6 + (levelNum > 90 ? 1 : 0);
    cols = 6 + (levelNum > 90 ? 1 : 0);
    arrowCount = 21 + Math.floor((levelNum - 80) * 0.3) + Math.floor(rng() * 4);
  }

  // Cap arrow count to fit inside grid cleanly
  const maxArrows = Math.floor(rows * cols * 0.7);
  arrowCount = Math.min(arrowCount, maxArrows);

  // Reverse Construction Algorithm
  // Start with empty grid, place arrows backward such that each new arrow's path out is unblocked
  // by existing arrows placed BEFORE it in reverse (meaning placed AFTER it in forward play).
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const placedArrows = [];

  for (let step = 0; step < arrowCount; step++) {
    const candidates = [];

    // Find all empty cells (r, c)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null) continue;

        // Try all 4 directions
        for (const dir of DIRECTIONS) {
          const { dr, dc } = DIR_VECTORS[dir];
          let nr = r + dr;
          let nc = c + dc;
          let clearPath = true;

          // Check path out of board
          while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (grid[nr][nc] !== null) {
              // Path is blocked by an arrow that was ALREADY placed in reverse sequence
              // In reverse construction, an arrow placed earlier in reverse leaves AFTER this arrow during solve.
              // Therefore, it BLOCKS this arrow's exit path in the forward game!
              clearPath = false;
              break;
            }
            nr += dr;
            nc += dc;
          }

          if (clearPath) {
            candidates.push({ r, c, dir });
          }
        }
      }
    }

    if (candidates.length === 0) {
      // If no candidate available, stop early (we still have a valid puzzle)
      break;
    }

    // Pick a candidate using PRNG
    const choice = candidates[Math.floor(rng() * candidates.length)];
    const color = COLOR_PALETTES[Math.floor(rng() * COLOR_PALETTES.length)];
    const arrowObj = {
      id: step + 1,
      r: choice.r,
      c: choice.c,
      dir: choice.dir,
      color: color
    };

    grid[choice.r][choice.c] = arrowObj;
    placedArrows.push(arrowObj);
  }

  return {
    rows,
    cols,
    arrows: placedArrows,
    targetMoves: placedArrows.length
  };
}

/**
 * Gets level data for levelNum (1 to 100)
 */
function getLevelData(levelNum) {
  const safeLevel = Math.max(1, Math.min(100, parseInt(levelNum, 10) || 1));
  return generateDeterministicLevel(safeLevel);
}

/**
 * Generates Daily Challenge puzzle based on date string (YYYY-MM-DD)
 */
function getDailyChallengeData(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash) % 90 + 10; // Level 10-100 equivalent difficulty
  const baseLevel = generateDeterministicLevel(seed);
  baseLevel.isDaily = true;
  baseLevel.dateStr = dateStr;
  return baseLevel;
}
