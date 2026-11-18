import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameTree, handicapPoints } from '../src/gametree.js';
import { BLACK, WHITE } from '../src/board.js';

const load = (sgf) => GameTree.fromSgf(sgf)[0];

test('create builds a valid root and survives an SGF round trip', () => {
  const t = GameTree.create({ width: 9, komi: 5.5, black: 'Ann', white: 'Bob', date: '2026-01-02' });
  const back = load(t.toSgf());
  assert.equal(back.width, 9);
  assert.equal(back.root.get('KM'), '5.5');
  assert.equal(back.root.get('PB'), 'Ann');
  assert.equal(back.root.get('DT'), '2026-01-02');
  assert.equal(back.toSgf(), t.toSgf());
});

test('rectangular boards', () => {
  const t = GameTree.create({ width: 9, height: 13 });
  assert.equal(t.root.get('SZ'), '9:13');
  const back = load(t.toSgf());
  assert.equal(back.width, 9);
  assert.equal(back.height, 13);
  assert.equal(back.position(back.root).board.cells.length, 117);
});

test('positions follow moves, captures, players and move numbers', () => {
  const t = load('(;SZ[5];B[ba];W[aa];B[ab];W[ca];B[bb])');
  let n = t.root;
  const nodes = [n];
  while (t.next(n)) nodes.push((n = t.next(n)));
  const last = t.position(nodes[5]);
  assert.equal(last.moveNumber, 5);
  assert.equal(last.player, WHITE);
  assert.equal(last.lastMove.sign, BLACK);
  assert.equal(t.position(nodes[2]).board.get(0, 0), WHITE);
  assert.equal(t.position(nodes[3]).board.get(0, 0), 0, 'white stone at aa is captured by B[ab]');
  assert.equal(t.position(nodes[3]).board.capturedBy[BLACK], 1);
  assert.equal(t.position(nodes[5]).board.capturedBy[BLACK], 1, 'capture counts accumulate');
  assert.equal(t.position(nodes[0]).player, BLACK);
});

test('passes and "tt" are passes and still count as moves', () => {
  const t = load('(;SZ[9];B[];W[tt];B[aa])');
  const n3 = t.end(t.root);
  const pos = t.position(n3);
  assert.equal(pos.moveNumber, 3);
  assert.equal(pos.board.get(0, 0), BLACK);
  assert.equal(t.position(t.root.children[0]).lastMove.pass, true);
  assert.equal(t.position(t.root.children[0].children[0]).lastMove.pass, true);
});

test('setup stones, PL and handicap decide who moves next', () => {
  const t = load('(;SZ[9]AB[aa][bb:cc]AW[ii]PL[W];B[dd])');
  const p = t.position(t.root);
  assert.equal(p.board.get(2, 2), BLACK);
  assert.equal(p.board.get(8, 8), WHITE);
  assert.equal(p.player, WHITE);
  const h = GameTree.create({ width: 19, handicap: 4 });
  assert.equal(h.position(h.root).player, WHITE);
  assert.equal([...h.position(h.root).board.cells].filter((c) => c === BLACK).length, 4);
});

test('handicap placements for standard sizes', () => {
  assert.equal(handicapPoints(19, 19, 9).length, 9);
  assert.deepEqual(handicapPoints(19, 19, 2), [[15, 3], [3, 15]]);
  assert.equal(handicapPoints(9, 9, 5).length, 5);
  assert.deepEqual(handicapPoints(19, 19, 1), []);
  assert.equal(handicapPoints(13, 13, 6).length, 6);
});

test('variations: playMove reuses identical children and remembers the branch', () => {
  const t = GameTree.create({ width: 9 });
  const a = t.playMove(t.root, BLACK, 4, 4).node;
  const b1 = t.playMove(a, WHITE, 2, 2);
  const b2 = t.playMove(a, WHITE, 6, 6);
  assert.equal(b1.created && b2.created, true);
  assert.equal(t.playMove(a, WHITE, 2, 2).created, false);
  assert.equal(a.children.length, 2);
  assert.equal(t.next(a), b1.node, 'moving forward follows the branch that was last visited');
  t.focus(b2.node);
  assert.equal(t.next(a), b2.node);
  assert.equal(t.sibling(b2.node, -1), b1.node);
  assert.equal(t.sibling(b2.node, 1), null);
  assert.equal(t.end(t.root), b2.node);
});

test('shift, makeMain, removeOthers and remove', () => {
  const t = load('(;SZ[9];B[aa](;W[bb];B[cc])(;W[dd])(;W[ee]))');
  const a = t.root.children[0];
  const [v1, v2, v3] = a.children;
  assert.equal(t.shift(v3, -1), true);
  assert.deepEqual(a.children, [v1, v3, v2]);
  assert.equal(t.shift(v1, -1), false);
  t.makeMain(v2);
  assert.equal(a.children[0], v2);
  t.removeOthers(v3);
  assert.deepEqual(a.children, [v3]);
  const parent = t.remove(v3);
  assert.equal(parent, a);
  assert.equal(a.children.length, 0);
  assert.equal(t.remove(t.root), t.root, 'the root cannot be removed');
});

test('editing invalidates cached positions', () => {
  const t = load('(;SZ[9];B[aa];W[bb])');
  const last = t.end(t.root);
  assert.equal(t.position(last).board.get(0, 0), BLACK);
  t.setProp(last.parent, 'B', ['cc']);
  assert.equal(t.position(last).board.get(0, 0), 0);
  assert.equal(t.position(last).board.get(2, 2), BLACK);
});

test('index paths restore the cursor after a reload', () => {
  const t = load('(;SZ[9];B[aa](;W[bb])(;W[dd];B[ee]))');
  const target = t.root.children[0].children[1].children[0];
  const copy = load(t.toSgf());
  assert.equal(copy.nodeAt(t.indexPath(target)).get('B'), 'ee');
  assert.deepEqual(t.indexPath(t.root), []);
});

test('game info round trip', () => {
  const t = GameTree.create({ width: 19 });
  t.setInfo({ blackName: 'Lee', whiteName: 'Ke', result: 'W+R', gameName: '', comment: 'a\nb' });
  const info = load(t.toSgf()).getInfo();
  assert.equal(info.blackName, 'Lee');
  assert.equal(info.result, 'W+R');
  assert.equal(info.comment, 'a\nb');
  assert.equal(info.gameName, '');
});

test('deep single-line games do not overflow the stack', () => {
  let sgf = '(;SZ[19]';
  for (let i = 0; i < 20000; i++) sgf += i % 2 ? ';W[]' : ';B[]';
  sgf += ')';
  const t = load(sgf);
  assert.equal(t.position(t.end(t.root)).moveNumber, 20000);
  const copy = load(t.toSgf());
  assert.equal(copy.position(copy.end(copy.root)).moveNumber, 20000);
});
