/**
 * qr.mjs — a QR encoder, because the alternative is typing an IP on a phone.
 *
 * Provisioning the pad means entering the desk's LAN URL and the pad token into
 * a captive portal, on a phone keyboard, while the phone is joined to the pad's
 * own access point and has no internet. Typing `http://192.168.1.19:8080` and a
 * token by hand, in front of an audience, is exactly where a demo dies.
 *
 * So: byte mode, error correction level M, automatic version. No dependency —
 * the desk has to work on venue wi-fi, and a QR library fetched from a CDN is a
 * QR that does not render when the wi-fi is bad, which is precisely when it is
 * needed.
 *
 * Correctness is not assumed. `test/qr.test.mjs` renders these to PNG and reads
 * them back with a real decoder.
 */

// ── Galois field arithmetic over GF(256), the field Reed-Solomon uses ────────
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;                 // the QR spec's primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `degree` error-correction codewords. */
function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

/**
 * Reed-Solomon remainder — the error-correction codewords for one block.
 *
 * `generator()` returns coefficients lowest-degree-first, and the division
 * below needs them highest-degree-first with the leading 1 dropped. Feeding it
 * the ascending order produces a stream that looks like a QR code, places
 * correctly, and reads its own payload back — and is rejected by every real
 * scanner, because the syndromes are non-zero.
 */
function ecc(data, degree) {
  const gen = generator(degree).slice(0, degree).reverse();
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i], factor);
  }
  return rem;
}

// ── Capacity tables, error-correction level M only ──────────────────────────
// Per version: total codewords, EC codewords per block, block counts.
// Group 2 blocks always hold one more data codeword than group 1.
const VERSIONS = [
  //  ver  total  ecPerBlock  g1Blocks  g2Blocks
  [1, 26, 10, 1, 0], [2, 44, 16, 1, 0], [3, 70, 26, 1, 0], [4, 100, 18, 2, 0],
  [5, 134, 24, 2, 0], [6, 172, 16, 4, 0], [7, 196, 18, 4, 0], [8, 242, 22, 2, 2],
  [9, 292, 22, 3, 2], [10, 346, 26, 4, 1], [11, 404, 30, 1, 4], [12, 466, 22, 6, 2],
  [13, 532, 22, 8, 1], [14, 581, 24, 4, 5], [15, 655, 24, 5, 5], [16, 733, 28, 7, 3],
];

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54],
  12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
};

/** Format bits for EC level M and a mask, BCH-encoded and XOR-masked. */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;             // 00 = level M
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Version bits for versions >= 7, BCH-encoded. */
function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/**
 * Encode text as a QR matrix of booleans (true = dark).
 * Throws if the text does not fit in the versions tabulated above.
 */
export function encode(text) {
  const bytes = [...new TextEncoder().encode(text)];

  // Smallest version whose data capacity holds the payload plus its header.
  let spec = null;
  for (const v of VERSIONS) {
    const [version, total, ecPerBlock, g1, g2] = v;
    const dataCodewords = total - ecPerBlock * (g1 + g2);
    const lenBits = version >= 10 ? 16 : 8;    // byte-mode length field width
    if (4 + lenBits + bytes.length * 8 <= dataCodewords * 8) { spec = v; break; }
  }
  if (!spec) throw new Error(`${bytes.length} bytes is more than this encoder's largest version holds`);

  const [version, total, ecPerBlock, g1, g2] = spec;
  const dataCodewords = total - ecPerBlock * (g1 + g2);
  const lenBits = version >= 10 ? 16 : 8;

  // ── bitstream: mode, length, payload, terminator, pad ─────────────────────
  const bits = [];
  const push = (value, width) => { for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);                             // byte mode
  push(bytes.length, lenBits);
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCodewords * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8)
    words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0; words.length < dataCodewords; pad ^= 1) words.push(pad ? 0x11 : 0xec);

  // ── split into blocks, compute EC, interleave ─────────────────────────────
  const blocks = [], eccs = [];
  const g1Len = Math.floor(dataCodewords / (g1 + g2));
  let at = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const len = i < g1 ? g1Len : g1Len + 1;
    const block = words.slice(at, at + len); at += len;
    blocks.push(block);
    eccs.push(ecc(block, ecPerBlock));
  }
  const out = [];
  for (let i = 0; i < g1Len + 1; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const e of eccs) out.push(e[i]);

  // ── lay out the modules ───────────────────────────────────────────────────
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const finder = (r, c) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const y = r + dr, x = c + dc;
      if (y < 0 || y >= size || x < 0 || x >= size) continue;
      const inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const ring = inner && (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
                             (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      m[y][x] = inner ? ring : false;
      reserved[y][x] = true;
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {         // timing patterns
    m[6][i] = m[i][6] = i % 2 === 0;
    reserved[6][i] = reserved[i][6] = true;
  }

  for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
    if (reserved[r][c]) continue;              // skips the ones over the finders
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      reserved[r + dr][c + dc] = true;
    }
  }

  m[size - 8][8] = true; reserved[size - 8][8] = true;   // the always-dark module
  for (let i = 0; i < 9; i++) {                          // format information
    if (!reserved[8][i]) { reserved[8][i] = true; m[8][i] = false; }
    if (!reserved[i][8]) { reserved[i][8] = true; m[i][8] = false; }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true; m[8][size - 1 - i] ??= false;
    reserved[size - 1 - i][8] = true; m[size - 1 - i][8] ??= false;
  }
  if (version >= 7) for (let i = 0; i < 18; i++) {       // version information
    const r = Math.floor(i / 3), c = i % 3;
    reserved[size - 11 + c][r] = true; m[size - 11 + c][r] = false;
    reserved[r][size - 11 + c] = true; m[r][size - 11 + c] = false;
  }

  // Zig-zag upward in two-column strips, skipping the vertical timing column.
  let bit = 0, upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (reserved[y][x]) continue;
        const byte = out[bit >>> 3];
        m[y][x] = byte === undefined ? false : ((byte >>> (7 - (bit & 7))) & 1) === 1;
        bit++;
      }
    }
    upward = !upward;
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,       (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,             (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  /** The spec's penalty score. Lower is easier for a scanner to read. */
  const penalty = (g) => {
    let p = 0;
    for (let i = 0; i < size; i++) {
      for (const line of [g[i], g.map((row) => row[i])]) {
        let run = 1;
        for (let j = 1; j < size; j++) {
          if (line[j] === line[j - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++)
      if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    const bad = [true, false, true, true, true, false, true];
    for (let i = 0; i < size; i++) for (let j = 0; j + 7 <= size; j++) {
      for (const line of [g[i], g.map((row) => row[i])]) {
        if (bad.every((v, k) => line[j + k] === v)) {
          const before = line.slice(Math.max(0, j - 4), j);
          const after = line.slice(j + 7, j + 11);
          if ((before.length === 4 && before.every((v) => !v)) ||
              (after.length === 4 && after.every((v) => !v))) p += 40;
        }
      }
    }
    const dark = g.flat().filter(Boolean).length;
    p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return p;
  };

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = m.map((row, r) => row.map((v, c) => (reserved[r][c] ? v : v !== MASKS[mask](r, c))));
    const fmt = formatBits(mask);
    for (let i = 0; i < 15; i++) {
      // Bit 14 is the first module placed, not bit 0. Indexing from the LSB
      // here writes the format word backwards, and a scanner that cannot read
      // the format never gets as far as the data.
      const on = ((fmt >>> (14 - i)) & 1) === 1;
      if (i < 6) g[8][i] = on; else if (i < 8) g[8][i + 1] = on;
      else if (i === 8) g[7][8] = on; else g[14 - i][8] = on;
      if (i < 8) g[size - 1 - i][8] = on; else g[8][size - 15 + i] = on;
    }
    if (version >= 7) {
      const vb = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const on = ((vb >>> i) & 1) === 1;
        const r = Math.floor(i / 3), c = i % 3;
        g[size - 11 + c][r] = on;
        g[r][size - 11 + c] = on;
      }
    }
    const score = penalty(g);
    if (!best || score < best.score) best = { score, grid: g };
  }
  return best.grid.map((row) => row.map(Boolean));
}

/** The matrix as an SVG string, with the quiet zone the spec requires. */
export function svg(text, { scale = 6, quiet = 4, dark = "#000", light = "#fff" } = {}) {
  const g = encode(text);
  const n = g.length, dim = (n + quiet * 2) * scale;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (g[r][c]) path += `M${(c + quiet) * scale} ${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="pad setup code">` +
         `<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
