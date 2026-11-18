// Scoring: territory (Japanese/Korean) and area (Chinese) counting with user-marked dead stones.

import { BLACK, WHITE } from './board.js';

/** Returns a new Set with the chain at (x, y) toggled dead/alive. Empty points are ignored. */
export function toggleDead(board, dead, x, y) {
  const next = new Set(dead);
  const { stones } = board.chain(x, y);
  if (!stones.length) return next;
  const w = board.width;
  const allDead = stones.every(([sx, sy]) => next.has(sy * w + sx));
  for (const [sx, sy] of stones) {
    if (allDead) next.delete(sy * w + sx);
    else next.add(sy * w + sx);
  }
  return next;
}

/**
 * Scores `board`. `dead` is a Set of cell indices whose stones count as captured.
 * Result: { territory, black, white, area: {black, white}, japanese: {black, white}, ... } where
 * `territory` marks every empty/dead point owned by a colour (1 / -1 / 0 for neutral).
 */
export function score(board, dead = new Set(), komi = 0) {
  const { width: w, height: h } = board;
  const cells = Int8Array.from(board.cells);
  let deadBlack = 0;
  let deadWhite = 0;
  for (const idx of dead) {
    if (cells[idx] === BLACK) deadBlack++;
    else if (cells[idx] === WHITE) deadWhite++;
    cells[idx] = 0;
  }

  let stonesB = 0;
  let stonesW = 0;
  for (const c of cells) {
    if (c === BLACK) stonesB++;
    else if (c === WHITE) stonesW++;
  }

  const territory = new Int8Array(cells.length);
  const seen = new Uint8Array(cells.length);
  let terrB = 0;
  let terrW = 0;
  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== 0 || seen[start]) continue;
    const region = [];
    let touchesB = false;
    let touchesW = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop();
      region.push(k);
      const x = k % w;
      const y = (k - x) / w;
      for (const [nx, ny] of board.neighbors(x, y)) {
        const nk = ny * w + nx;
        const c = cells[nk];
        if (c === BLACK) touchesB = true;
        else if (c === WHITE) touchesW = true;
        else if (!seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    if (touchesB === touchesW) continue; // neutral (or an empty board)
    const owner = touchesB ? BLACK : WHITE;
    for (const k of region) territory[k] = owner;
    if (owner === BLACK) terrB += region.length;
    else terrW += region.length;
  }

  const prisonersB = board.capturedBy[BLACK] + deadWhite;
  const prisonersW = board.capturedBy[WHITE] + deadBlack;
  const area = { black: stonesB + terrB, white: stonesW + terrW + komi };
  const territoryScore = { black: terrB + prisonersB, white: terrW + prisonersW + komi };
  return {
    territory, komi, height: h,
    stones: { black: stonesB, white: stonesW },
    points: { black: terrB, white: terrW },
    prisoners: { black: prisonersB, white: prisonersW },
    area,
    japanese: territoryScore,
  };
}

/** Rule sets that count area; everything else (Japanese, Korean, unknown) counts territory. */
export function usesAreaScoring(rules = '') {
  return /chinese|aga|ing|nz|new\s*zealand|tromp|taylor/i.test(rules);
}

/** SGF result string for a pair of scores: 'B+3.5', 'W+12', '0'. */
export function formatResult(black, white) {
  const diff = Math.round((black - white) * 100) / 100;
  if (diff > 0) return `B+${diff}`;
  if (diff < 0) return `W+${-diff}`;
  return '0';
}
