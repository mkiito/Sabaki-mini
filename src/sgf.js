// SGF (FF4) parser and serializer. No dependencies, works in browsers and Node.
//
// A parsed node is a plain object: { data: { B: ['pd'], C: ['text'] }, children: [node, ...] }.
// Property values are stored unescaped; a property always holds an array of strings.

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿';
const isLetter = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');

/** Parse SGF text into a collection (array) of root nodes. Tolerant of damaged files. */
export function parse(text) {
  const s = String(text);
  const n = s.length;
  let i = 0;

  function skipSpace() {
    while (i < n && isSpace(s[i])) i++;
  }

  function readValue() {
    i++; // '['
    let out = '';
    while (i < n) {
      const c = s[i];
      if (c === '\\') {
        i++;
        if (i >= n) break;
        const d = s[i];
        if (d === '\r') {
          i++;
          if (s[i] === '\n') i++;
        } else if (d === '\n') {
          i++;
          if (s[i] === '\r') i++;
        } else {
          out += d;
          i++;
        }
      } else if (c === ']') {
        i++;
        return out;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function readNodeData() {
    i++; // ';'
    const data = {};
    for (;;) {
      skipSpace();
      const start = i;
      while (i < n && isLetter(s[i])) i++;
      if (i === start) break;
      // FF3 allowed lowercase letters inside identifiers; they carry no meaning.
      const ident = s.slice(start, i).replace(/[a-z]/g, '');
      const values = [];
      skipSpace();
      while (i < n && s[i] === '[') {
        values.push(readValue());
        skipSpace();
      }
      if (ident && values.length) data[ident] = (data[ident] || []).concat(values);
    }
    return data;
  }

  function readTree() {
    i++; // '('
    let first = null;
    let last = null;
    while (i < n) {
      skipSpace();
      const c = s[i];
      if (c === ';') {
        const node = { data: readNodeData(), children: [] };
        if (last) last.children.push(node);
        else first = node;
        last = node;
      } else if (c === '(') {
        if (!last) first = last = { data: {}, children: [] };
        const sub = readTree();
        if (sub) last.children.push(sub);
      } else if (c === ')') {
        i++;
        break;
      } else {
        i++; // stray character
      }
    }
    return first;
  }

  const roots = [];
  while (i < n) {
    if (s[i] === '(') {
      const tree = readTree();
      if (tree) roots.push(tree);
    } else {
      i++;
    }
  }
  return roots;
}

/** Serialize a root node (see parse) to SGF text. */
export function stringify(root, { linebreak = '\n' } = {}) {
  const esc = (v) => v.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');

  function nodeText(node) {
    let out = ';';
    for (const key of Object.keys(node.data)) {
      const values = node.data[key];
      if (!values || !values.length) continue;
      out += key;
      for (const v of values) out += '[' + esc(String(v)) + ']';
    }
    return out;
  }

  function sequence(node) {
    let out = '';
    let cur = node;
    let first = true;
    while (cur) {
      out += (first ? '' : linebreak) + nodeText(cur);
      first = false;
      if (cur.children.length === 1) {
        cur = cur.children[0];
      } else {
        for (const child of cur.children) out += linebreak + '(' + sequence(child) + ')';
        cur = null;
      }
    }
    return out;
  }

  return '(' + sequence(root) + ')' + linebreak;
}

/** 'dd' -> [3, 3]. Returns null for a pass ('' or 'tt' on boards up to 19x19) or an invalid value. */
export function parseVertex(value, width = 19, height = width) {
  if (typeof value !== 'string' || value.length !== 2) return null;
  const x = ALPHA.indexOf(value[0]);
  const y = ALPHA.indexOf(value[1]);
  if (x < 0 || y < 0) return null;
  if (x === 19 && y === 19 && width <= 19 && height <= 19) return null; // 'tt' is a pass
  if (x >= width || y >= height) return null;
  return [x, y];
}

export function stringifyVertex(x, y) {
  return ALPHA[x] + ALPHA[y];
}

/** Expands point lists such as ['aa', 'bb:cc'] into [[x, y], ...]. Rectangles use 'ul:lr'. */
export function parsePoints(values, width = 19, height = width) {
  const out = [];
  for (const value of values || []) {
    const colon = value.indexOf(':');
    if (colon < 0) {
      const v = parseVertex(value, width, height);
      if (v) out.push(v);
      continue;
    }
    const a = parseVertex(value.slice(0, colon), width, height);
    const b = parseVertex(value.slice(colon + 1), width, height);
    if (!a || !b) continue;
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) {
      for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, y]);
    }
  }
  return out;
}

/** SZ[19] or SZ[19:13] -> { width, height }. Falls back to 19x19. */
export function parseSize(value) {
  const m = /^\s*(\d+)\s*(?::\s*(\d+))?\s*$/.exec(value || '');
  if (!m) return { width: 19, height: 19 };
  const width = Math.min(52, Math.max(1, parseInt(m[1], 10)));
  const height = m[2] ? Math.min(52, Math.max(1, parseInt(m[2], 10))) : width;
  return { width, height };
}

export function stringifySize(width, height) {
  return width === height ? String(width) : `${width}:${height}`;
}

/** Splits a composed value at its first colon: 'aa:Label' -> ['aa', 'Label']. */
export function splitCompose(value) {
  const k = value.indexOf(':');
  return k < 0 ? [value, ''] : [value.slice(0, k), value.slice(k + 1)];
}

const CHARSET_ALIASES = { 'utf-8': 'utf-8', utf8: 'utf-8', ascii: 'utf-8', 'us-ascii': 'utf-8' };

/** Decodes the raw bytes of an SGF file, honouring a byte-order mark and the CA[] property. */
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(u8.subarray(3));
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));

  const latin = new TextDecoder('windows-1252').decode(u8);
  const m = /CA\s*\[([^\]]*)\]/.exec(latin);
  const declared = m ? m[1].trim().toLowerCase() : '';
  const label = CHARSET_ALIASES[declared] || declared;

  if (label && label !== 'utf-8') {
    try {
      return new TextDecoder(label).decode(u8);
    } catch (e) {
      // unknown charset label: fall through to guessing
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch (e) {
    return latin;
  }
}
