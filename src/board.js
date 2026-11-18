// Go board: stones, captures, suicide and simple ko. Immutable-style: play() returns a new board.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;

export class Board {
  constructor(width = 19, height = width) {
    this.width = width;
    this.height = height;
    this.cells = new Int8Array(width * height);
    this.capturedBy = { 1: 0, '-1': 0 }; // stones taken by black / by white
    this.ko = null; // { x, y, sign }: `sign` may not play at (x, y) right now
  }

  clone() {
    const b = new Board(this.width, this.height);
    b.cells.set(this.cells);
    b.capturedBy = { 1: this.capturedBy[1], '-1': this.capturedBy[-1] };
    b.ko = this.ko;
    return b;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.cells[y * this.width + x] : 0;
  }

  set(x, y, sign) {
    if (this.inBounds(x, y)) this.cells[y * this.width + x] = sign;
  }

  neighbors(x, y) {
    const out = [];
    if (x > 0) out.push([x - 1, y]);
    if (x < this.width - 1) out.push([x + 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (y < this.height - 1) out.push([x, y + 1]);
    return out;
  }

  /** Connected stones of one colour around (x, y) and their liberties (as cell indices). */
  chain(x, y) {
    const sign = this.get(x, y);
    const stones = [];
    const liberties = new Set();
    if (!sign) return { sign, stones, liberties };
    const w = this.width;
    const seen = new Uint8Array(this.cells.length);
    const stack = [[x, y]];
    seen[y * w + x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      stones.push([cx, cy]);
      for (const [nx, ny] of this.neighbors(cx, cy)) {
        const k = ny * w + nx;
        const c = this.cells[k];
        if (c === 0) liberties.add(k);
        else if (c === sign && !seen[k]) {
          seen[k] = 1;
          stack.push([nx, ny]);
        }
      }
    }
    return { sign, stones, liberties };
  }

  /**
   * Plays a move. `x == null` is a pass. In strict mode (interactive play) overwrites, suicide and
   * immediate ko recaptures are refused with { error }. In lenient mode (loading files) they are
   * resolved the way most editors do: the stone replaces the old one, suicides are removed.
   * Returns { board, captured: [[x, y], ...], error? }.
   */
  play(sign, x, y, strict = false) {
    const b = this.clone();
    b.ko = null;
    if (x == null || y == null || !this.inBounds(x, y)) return { board: b, captured: [] };

    if (strict) {
      if (this.get(x, y) !== EMPTY) return { error: 'overwrite' };
      if (this.ko && this.ko.sign === sign && this.ko.x === x && this.ko.y === y) return { error: 'ko' };
    }

    b.set(x, y, sign);
    const captured = [];
    for (const [nx, ny] of b.neighbors(x, y)) {
      if (b.get(nx, ny) !== -sign) continue;
      const enemy = b.chain(nx, ny);
      if (enemy.liberties.size > 0) continue;
      for (const [sx, sy] of enemy.stones) {
        b.set(sx, sy, EMPTY);
        captured.push([sx, sy]);
      }
    }
    b.capturedBy[sign] += captured.length;

    const own = b.chain(x, y);
    if (own.liberties.size === 0) {
      if (strict) return { error: 'suicide' };
      for (const [sx, sy] of own.stones) b.set(sx, sy, EMPTY);
      b.capturedBy[-sign] += own.stones.length;
    } else if (captured.length === 1 && own.stones.length === 1 && own.liberties.size === 1) {
      b.ko = { x: captured[0][0], y: captured[0][1], sign: -sign };
    }
    return { board: b, captured };
  }

  /** Applies AB / AW / AE style setup. `points` is a list of [x, y]. */
  setup(sign, points) {
    for (const [x, y] of points) this.set(x, y, sign);
    this.ko = null;
  }

  /** Stable string of the stone layout; handy for comparisons in tests. */
  toString() {
    let out = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) out += '.XO'[this.get(x, y) === -1 ? 2 : this.get(x, y)];
      out += '\n';
    }
    return out;
  }
}
