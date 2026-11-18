import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, BLACK, WHITE } from '../src/board.js';

function fromText(rows) {
  const b = new Board(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => b.set(x, y, c === 'X' ? BLACK : c === 'O' ? WHITE : 0)));
  return b;
}

test('captures a single stone once its last liberty is taken', () => {
  const b = fromText(['.X.', 'XO.', '...']);
  const first = b.play(BLACK, 1, 2);
  assert.deepEqual(first.captured, []);
  const second = first.board.play(BLACK, 2, 1);
  assert.deepEqual(second.captured, [[1, 1]]);
  assert.equal(second.board.get(1, 1), 0);
  assert.equal(second.board.capturedBy[BLACK], 1);
  assert.equal(b.get(1, 1), WHITE, 'the original board is not modified');
});

test('captures a whole group', () => {
  const b = fromText(['.XX.', 'XOOX', '....']);
  const r = b.play(BLACK, 1, 2).board.play(BLACK, 2, 2);
  assert.equal(r.captured.length, 2);
  assert.equal(r.board.capturedBy[BLACK], 2);
  assert.equal(r.board.get(1, 1) + r.board.get(2, 1), 0);
});

test('corner and edge points have fewer neighbours', () => {
  const b = new Board(5, 5);
  assert.equal(b.neighbors(0, 0).length, 2);
  assert.equal(b.neighbors(2, 0).length, 3);
  assert.equal(b.neighbors(2, 2).length, 4);
});

test('strict mode refuses overwrite and suicide; lenient mode resolves them', () => {
  const b = fromText(['.O.', 'O.O', '.O.']);
  assert.equal(b.play(BLACK, 1, 1, true).error, 'suicide');
  const lenient = b.play(BLACK, 1, 1, false);
  assert.equal(lenient.board.get(1, 1), 0);
  assert.equal(lenient.board.capturedBy[WHITE], 1);
  assert.equal(b.play(WHITE, 0, 1, true).error, 'overwrite');
  assert.equal(b.play(BLACK, 0, 1, false).board.get(0, 1), BLACK, 'lenient overwrite replaces the stone');
});

test('a move that captures is not suicide', () => {
  const b = fromText(['.OX', 'OXX']);
  const r = b.play(BLACK, 0, 0, true);
  assert.equal(r.error, undefined);
  assert.equal(r.captured.length, 2);
  assert.equal(r.board.get(0, 0), BLACK);
});

test('simple ko forbids only the immediate recapture', () => {
  const b = fromText(['.XO.', 'XO.O', '.XO.']);
  const cap = b.play(BLACK, 2, 1, true);
  assert.deepEqual(cap.captured, [[1, 1]]);
  assert.deepEqual(cap.board.ko, { x: 1, y: 1, sign: WHITE });
  assert.equal(cap.board.play(WHITE, 1, 1, true).error, 'ko');
  assert.equal(cap.board.play(BLACK, 1, 1, true).error, undefined, 'the ko point is only forbidden to the opponent');
  const elsewhere = cap.board.play(WHITE, 3, 0, true).board;
  assert.equal(elsewhere.ko, null);
  assert.equal(elsewhere.play(WHITE, 1, 1, true).error, undefined);
});

test('capturing more than one stone is not a ko', () => {
  const b = fromText(['.XO.', 'XOO.', '.XO.']);
  assert.equal(b.play(BLACK, 3, 1, false).board.ko, null);
});

test('a pass clears ko and out-of-range moves behave like a pass', () => {
  const b = fromText(['.X.', 'X.X', '.X.']);
  assert.equal(b.play(WHITE, null, null).board.ko, null);
  assert.equal(b.play(BLACK, 9, 9).board.toString(), b.toString());
});

test('chain reports stones and liberties', () => {
  const b = fromText(['XX.', '.O.', '...']);
  const c = b.chain(0, 0);
  assert.equal(c.stones.length, 2);
  assert.equal(c.liberties.size, 2);
  assert.equal(b.chain(2, 2).stones.length, 0);
});
