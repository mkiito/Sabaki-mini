import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, BLACK, WHITE } from '../src/board.js';
import { score, toggleDead, usesAreaScoring, formatResult } from '../src/scoring.js';

function fromText(rows) {
  const b = new Board(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => b.set(x, y, c === 'X' ? BLACK : c === 'O' ? WHITE : 0)));
  return b;
}

// Black owns the left, white the right, one neutral point on the border.
const GAME = ['..XO..', '..XO..', '..XO..', '..X.O.', '..XO..'];

test('counts territory, area and neutral points', () => {
  const b = fromText(GAME);
  const s = score(b, new Set(), 0);
  assert.deepEqual(s.stones, { black: 5, white: 5 });
  assert.deepEqual(s.points, { black: 10, white: 9 });
  assert.equal(s.area.black, 15);
  assert.equal(s.area.white, 14);
  assert.equal(s.territory[3 * 6 + 3], 0, 'the point between X and O is neutral');
});

test('komi and prisoners are added', () => {
  const b = fromText(GAME);
  b.capturedBy[BLACK] = 3;
  b.capturedBy[WHITE] = 1;
  const s = score(b, new Set(), 6.5);
  assert.equal(s.japanese.black, 10 + 3);
  assert.equal(s.japanese.white, 9 + 1 + 6.5);
  assert.equal(s.area.white, 14 + 6.5);
});

test('dead stones turn into prisoners and territory for the opponent', () => {
  const b = fromText(['.....', '.XXX.', '.XO..', '.XXX.', '.....']);
  const alive = score(b, new Set(), 0);
  assert.deepEqual(alive.points, { black: 0, white: 0 }, 'a living white stone makes the area neutral');

  const dead = toggleDead(b, new Set(), 2, 2);
  assert.equal(dead.size, 1);
  const s = score(b, dead, 0.5);
  assert.deepEqual(s.points, { black: 18, white: 0 });
  assert.equal(s.prisoners.black, 1);
  assert.equal(s.japanese.black, 19);
  assert.equal(s.japanese.white, 0.5);
  assert.equal(s.area.black, 25);
  assert.equal(s.stones.white, 0);
});

test('toggleDead flips the whole chain back and ignores empty points', () => {
  const b = fromText(['XX.', '..O', '...']);
  const dead = toggleDead(b, new Set(), 0, 0);
  assert.deepEqual([...dead].sort(), [0, 1]);
  assert.equal(toggleDead(b, dead, 1, 0).size, 0);
  assert.equal(toggleDead(b, new Set(), 2, 2).size, 0);
});

test('rule names and result strings', () => {
  assert.equal(usesAreaScoring('Chinese'), true);
  assert.equal(usesAreaScoring('AGA'), true);
  assert.equal(usesAreaScoring('Japanese'), false);
  assert.equal(usesAreaScoring(''), false);
  assert.equal(formatResult(10, 6.5), 'B+3.5');
  assert.equal(formatResult(6.5, 10), 'W+3.5');
  assert.equal(formatResult(7, 7), '0');
});
