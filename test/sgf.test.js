import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, stringify, parseVertex, stringifyVertex, parsePoints, parseSize, stringifySize, splitCompose, decodeBytes,
} from '../src/sgf.js';

test('parses a simple game with variations', () => {
  const [root] = parse('(;GM[1]FF[4]SZ[9];B[ee];W[ce](;B[cc])(;B[gg];W[cg]))');
  assert.deepEqual(root.data.SZ, ['9']);
  assert.equal(root.children.length, 1);
  const w = root.children[0].children[0];
  assert.deepEqual(w.data.W, ['ce']);
  assert.equal(w.children.length, 2);
  assert.deepEqual(w.children[0].data.B, ['cc']);
  assert.equal(w.children[1].children.length, 1);
});

test('unescapes values, joins soft line breaks and keeps ] and \\', () => {
  const [root] = parse('(;C[a\\]b \\\\ c\\\nd\r\ne:f])');
  assert.equal(root.data.C[0], 'a]b \\ cd\r\ne:f');
});

test('multiple values and whitespace between them', () => {
  const [root] = parse('(;AB[aa] [bb]\n[cc]AW[dd])');
  assert.deepEqual(root.data.AB, ['aa', 'bb', 'cc']);
  assert.deepEqual(root.data.AW, ['dd']);
});

test('is tolerant: junk, missing parens, lowercase letters in identifiers, collections', () => {
  const games = parse('garbage (;GM[1];B[aa]) tail (;GM[1];W[bb]');
  assert.equal(games.length, 2);
  assert.deepEqual(games[1].children[0].data.W, ['bb']);
  const [root] = parse('(;GaMe[1]SiZe[9])');
  assert.deepEqual(root.data.GM, ['1']);
  assert.deepEqual(root.data.SZ, ['9']);
  assert.deepEqual(parse('no sgf here'), []);
});

test('stringify round-trips, including escapes and variations', () => {
  const src = '(;GM[1]FF[4]C[x\\]y\\\\z];B[aa](;W[bb])(;W[cc];B[dd]))';
  const [root] = parse(src);
  const text = stringify(root);
  assert.equal(text.replace(/\s+/g, ''), src.replace(/\s+/g, ''));
  assert.deepEqual(parse(text)[0], root);
});

test('vertices', () => {
  assert.deepEqual(parseVertex('aa'), [0, 0]);
  assert.deepEqual(parseVertex('ss'), [18, 18]);
  assert.equal(parseVertex('tt', 19), null);
  assert.equal(parseVertex(''), null);
  assert.equal(parseVertex('jj', 9), null);
  assert.deepEqual(parseVertex('tt', 25), [19, 19]);
  assert.deepEqual(parseVertex('aB', 30), [0, 27]);
  assert.equal(stringifyVertex(3, 15), 'dp');
});

test('point lists with rectangles', () => {
  assert.deepEqual(parsePoints(['aa', 'bb:cc']), [[0, 0], [1, 1], [2, 1], [1, 2], [2, 2]]);
  assert.deepEqual(parsePoints(['cc:aa']).length, 9);
  assert.deepEqual(parsePoints(undefined), []);
});

test('size parsing', () => {
  assert.deepEqual(parseSize('19'), { width: 19, height: 19 });
  assert.deepEqual(parseSize('9:13'), { width: 9, height: 13 });
  assert.deepEqual(parseSize('abc'), { width: 19, height: 19 });
  assert.deepEqual(parseSize(undefined), { width: 19, height: 19 });
  assert.equal(stringifySize(9, 9), '9');
  assert.equal(stringifySize(9, 13), '9:13');
});

test('compose values split at the first colon only', () => {
  assert.deepEqual(splitCompose('aa:Hello: world'), ['aa', 'Hello: world']);
  assert.deepEqual(splitCompose('aa'), ['aa', '']);
});

test('decodeBytes handles BOM, declared charsets and invalid UTF-8', () => {
  const enc = new TextEncoder();
  assert.equal(decodeBytes(enc.encode('(;PB[Привет])')), '(;PB[Привет])');
  assert.equal(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('(;PB[ё])')])), '(;PB[ё])');
  // GBK: 中 = D6 D0
  const gbk = new Uint8Array([...enc.encode('(;CA[GBK]PB['), 0xd6, 0xd0, ...enc.encode('])')]);
  assert.equal(decodeBytes(gbk), '(;CA[GBK]PB[中])');
  // invalid UTF-8 with no declared charset falls back to a single-byte decoding
  const bad = new Uint8Array([...enc.encode('(;PB['), 0xe9, ...enc.encode('])')]);
  assert.equal(decodeBytes(bad), '(;PB[é])');
  // unknown charset label does not throw
  assert.equal(decodeBytes(enc.encode('(;CA[nonsense]PB[a])')), '(;CA[nonsense]PB[a])');
});
