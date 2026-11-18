// Game tree: nodes with SGF properties, variations, per-node board positions.

import { Board, BLACK, WHITE } from './board.js';
import { parse, stringify, parseVertex, parsePoints, parseSize, stringifySize, stringifyVertex } from './sgf.js';

let nextId = 1;

export class Node {
  constructor(data = {}, parent = null) {
    this.id = nextId++;
    this.data = data; // { B: ['pd'], C: ['comment'] }
    this.parent = parent;
    this.children = [];
    this.pref = 0; // child to follow when moving forward
    this._pos = null;
    this._ver = -1;
  }

  get(key, fallback = '') {
    const v = this.data[key];
    return v && v.length ? v[0] : fallback;
  }

  get hasMove() {
    return 'B' in this.data || 'W' in this.data;
  }
}

export const INFO_KEYS = {
  blackName: 'PB', blackRank: 'BR', blackTeam: 'BT',
  whiteName: 'PW', whiteRank: 'WR', whiteTeam: 'WT',
  gameName: 'GN', event: 'EV', round: 'RO', date: 'DT', place: 'PC', result: 'RE',
  komi: 'KM', handicap: 'HA', rules: 'RU', time: 'TM', overtime: 'OT',
  source: 'SO', annotator: 'AN', copyright: 'CP', comment: 'GC',
};

/** Standard handicap points as [x, y] (y counted from the top). */
export function handicapPoints(width, height, count) {
  if (count < 2) return [];
  const edge = Math.min(width, height) >= 13 ? 3 : 2;
  const l = edge, r = width - 1 - edge, t = edge, b = height - 1 - edge;
  const mx = (width - 1) / 2, my = (height - 1) / 2;
  const odd = Number.isInteger(mx) && Number.isInteger(my);
  const corners = [[r, t], [l, b], [r, b], [l, t]];
  const sides = [[l, my], [r, my], [mx, t], [mx, b]];
  const center = [[mx, my]];
  let pts;
  if (count <= 4) pts = corners.slice(0, count);
  else if (count === 5) pts = [...corners, ...center];
  else if (count === 6) pts = [...corners, sides[0], sides[1]];
  else if (count === 7) pts = [...corners, sides[0], sides[1], ...center];
  else if (count === 8) pts = [...corners, ...sides];
  else pts = [...corners, ...sides, ...center];
  if (!odd) pts = pts.filter(([x, y]) => Number.isInteger(x) && Number.isInteger(y));
  return pts.filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height);
}

export class GameTree {
  constructor(root) {
    this.root = root;
    this.version = 0;
    const size = parseSize(root.get('SZ'));
    this.width = size.width;
    this.height = size.height;
  }

  static create({ width = 19, height = width, komi = 6.5, handicap = 0, black = '', white = '', date } = {}) {
    const today = date || new Date().toISOString().slice(0, 10);
    const data = {
      GM: ['1'], FF: ['4'], CA: ['UTF-8'], AP: ['SabakiMini:0.1.0'],
      SZ: [stringifySize(width, height)], KM: [String(komi)], DT: [today],
    };
    if (black) data.PB = [black];
    if (white) data.PW = [white];
    if (handicap >= 2) {
      const pts = handicapPoints(width, height, handicap);
      data.HA = [String(handicap)];
      if (pts.length) data.AB = pts.map(([x, y]) => stringifyVertex(x, y));
    }
    return new GameTree(new Node(data));
  }

  static fromPlain(plain) {
    const root = new Node({ ...plain.data });
    const stack = [[plain, root]];
    while (stack.length) {
      const [p, n] = stack.pop();
      for (const c of p.children) {
        const child = new Node({ ...c.data }, n);
        n.children.push(child);
        stack.push([c, child]);
      }
    }
    return new GameTree(root);
  }

  static fromSgf(text) {
    return parse(text).map((plain) => GameTree.fromPlain(plain));
  }

  toPlain() {
    const plainRoot = { data: this.root.data, children: [] };
    const stack = [[this.root, plainRoot]];
    while (stack.length) {
      const [n, p] = stack.pop();
      for (const c of n.children) {
        const pc = { data: c.data, children: [] };
        p.children.push(pc);
        stack.push([c, pc]);
      }
    }
    return plainRoot;
  }

  toSgf() {
    return stringify(this.toPlain());
  }

  touch() {
    this.version++;
  }

  // ---- positions -------------------------------------------------------------------------

  position(node) {
    if (node._pos && node._ver === this.version) return node._pos;
    const pending = [];
    let cur = node;
    while (cur && !(cur._pos && cur._ver === this.version)) {
      pending.push(cur);
      cur = cur.parent;
    }
    let prev = cur ? cur._pos : null;
    for (let i = pending.length - 1; i >= 0; i--) {
      const n = pending[i];
      n._pos = this._compute(n, prev);
      n._ver = this.version;
      prev = n._pos;
    }
    return node._pos;
  }

  _compute(node, prev) {
    const { width: w, height: h } = this;
    const d = node.data;
    let board = prev ? prev.board : new Board(w, h);
    let player = prev ? prev.player : BLACK;
    let moveNumber = prev ? prev.moveNumber : 0;
    let lastMove = null;
    let captured = [];

    if (!prev && node.get('HA') && parseInt(node.get('HA'), 10) >= 2 && d.AB && !d.PL) player = WHITE;

    if (d.AB || d.AW || d.AE) {
      board = board.clone();
      board.setup(0, parsePoints(d.AE, w, h));
      board.setup(BLACK, parsePoints(d.AB, w, h));
      board.setup(WHITE, parsePoints(d.AW, w, h));
    }

    const key = 'B' in d ? 'B' : 'W' in d ? 'W' : null;
    if (key) {
      const sign = key === 'B' ? BLACK : WHITE;
      const v = parseVertex(node.get(key), w, h);
      const res = board.play(sign, v ? v[0] : null, v ? v[1] : null, false);
      board = res.board;
      captured = res.captured;
      lastMove = { sign, x: v ? v[0] : null, y: v ? v[1] : null, pass: !v };
      moveNumber += 1;
      player = -sign;
    } else {
      if (board.ko) {
        board = board.clone();
        board.ko = null;
      }
      if (d.PL) player = node.get('PL').toUpperCase() === 'W' ? WHITE : BLACK;
    }
    return { board, player, moveNumber, lastMove, captured };
  }

  // ---- navigation ------------------------------------------------------------------------

  pathTo(node) {
    const path = [];
    for (let n = node; n; n = n.parent) path.push(n);
    return path.reverse();
  }

  /** Child indices from the root down to `node`; used to restore the cursor after reloading. */
  indexPath(node) {
    const out = [];
    for (let n = node; n.parent; n = n.parent) out.push(n.parent.children.indexOf(n));
    return out.reverse();
  }

  nodeAt(indices) {
    let n = this.root;
    for (const i of indices) {
      if (!n.children[i]) break;
      n = n.children[i];
    }
    return n;
  }

  /** Remembers `node`'s branch so that "forward" and "end" follow it. */
  focus(node) {
    for (let n = node; n.parent; n = n.parent) n.parent.pref = n.parent.children.indexOf(n);
  }

  next(node) {
    return node.children[Math.min(node.pref, node.children.length - 1)] || null;
  }

  end(node) {
    let n = node;
    for (let c = this.next(n); c; c = this.next(n)) n = c;
    return n;
  }

  sibling(node, delta) {
    if (!node.parent) return null;
    return node.parent.children[node.parent.children.indexOf(node) + delta] || null;
  }

  /** Finds the node with the given move number along the line through `node`. */
  findMoveNumber(node, number) {
    for (const n of this.pathTo(this.end(node))) {
      if (this.position(n).moveNumber >= number) return n;
    }
    return this.end(node);
  }

  // ---- editing ---------------------------------------------------------------------------

  setProp(node, key, values) {
    const list = values == null ? [] : Array.isArray(values) ? values : [values];
    if (list.length === 0 || list.every((v) => v === '' && key !== 'B' && key !== 'W')) delete node.data[key];
    else node.data[key] = list.map(String);
    this.touch();
  }

  appendChild(parent, data) {
    const node = new Node(data, parent);
    parent.children.push(node);
    parent.pref = parent.children.length - 1;
    this.touch();
    return node;
  }

  /** Plays a move below `parent`, reusing an identical existing child. Returns { node, created }. */
  playMove(parent, sign, x, y) {
    const key = sign === BLACK ? 'B' : 'W';
    const value = x == null ? '' : stringifyVertex(x, y);
    const same = parent.children.find((c) => {
      if (!(key in c.data)) return false;
      const v = c.get(key);
      return v === value || (x == null && parseVertex(v, this.width, this.height) === null);
    });
    if (same) {
      parent.pref = parent.children.indexOf(same);
      return { node: same, created: false };
    }
    return { node: this.appendChild(parent, { [key]: [value] }), created: true };
  }

  /** Removes `node` with everything below it; returns the node to continue from. */
  remove(node) {
    const parent = node.parent;
    if (!parent) return node;
    parent.children.splice(parent.children.indexOf(node), 1);
    parent.pref = Math.max(0, Math.min(parent.pref, parent.children.length - 1));
    this.touch();
    return parent;
  }

  /** Moves `node` among its siblings; delta -1 shifts it towards the main line. */
  shift(node, delta) {
    const p = node.parent;
    if (!p) return false;
    const i = p.children.indexOf(node);
    const j = i + delta;
    if (j < 0 || j >= p.children.length) return false;
    [p.children[i], p.children[j]] = [p.children[j], p.children[i]];
    p.pref = j;
    this.touch();
    return true;
  }

  makeMain(node) {
    for (let n = node; n.parent; n = n.parent) {
      const p = n.parent;
      p.children.splice(p.children.indexOf(n), 1);
      p.children.unshift(n);
      p.pref = 0;
    }
    this.touch();
  }

  /** Drops every variation except the line leading to `node` (its own continuations stay). */
  removeOthers(node) {
    for (let n = node; n.parent; n = n.parent) {
      n.parent.children = [n];
      n.parent.pref = 0;
    }
    this.touch();
  }

  // ---- game info -------------------------------------------------------------------------

  getInfo() {
    const out = {};
    for (const [name, key] of Object.entries(INFO_KEYS)) out[name] = this.root.get(key);
    return out;
  }

  setInfo(info) {
    for (const [name, key] of Object.entries(INFO_KEYS)) {
      if (name in info) this.setProp(this.root, key, info[name].trim ? info[name].trim() : info[name]);
    }
    this.touch();
  }
}
