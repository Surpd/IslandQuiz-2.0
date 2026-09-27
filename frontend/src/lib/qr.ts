const VERSION_DATA = [
  { size: 21, data: 19, total: 26, ecc: 7, blocks: 1 },
  { size: 25, data: 34, total: 44, ecc: 10, blocks: 1 },
  { size: 29, data: 55, total: 70, ecc: 15, blocks: 1 },
  { size: 33, data: 80, total: 100, ecc: 20, blocks: 1 },
  { size: 37, data: 108, total: 134, ecc: 26, blocks: 1 },
  { size: 41, data: 136, total: 172, ecc: 18, blocks: 2 },
];

function multiply(a: number, b: number): number {
  if (!a || !b) return 0;
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    b >>>= 1;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return result;
}

function generator(degree: number): number[] {
  let result = [1];
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    const next = Array(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= multiply(result[j], root);
    }
    result = next;
    root = multiply(root, 2);
  }
  return result;
}

function ecc(data: number[], degree: number): number[] {
  const gen = generator(degree);
  const result = Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= multiply(gen[i + 1], factor);
  }
  return result;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function codewords(value: string, capacity: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  if (bits.length > capacity * 8) throw new Error("QR data is too long");
  appendBits(bits, 0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    result.push(bits.slice(i, i + 8).reduce((out, bit) => (out << 1) | bit, 0));
  }
  const pads = [0xec, 0x11];
  const dataLength = result.length;
  for (let i = dataLength; i < capacity; i += 1) result.push(pads[(i - dataLength) & 1]);
  return result;
}

function makeMatrix(value: string): boolean[][] {
  const byteLength = new TextEncoder().encode(value).length;
  const version = VERSION_DATA.findIndex((item) => byteLength + 2 <= item.data) + 1;
  if (!version) throw new Error("QR data is too long");
  const spec = VERSION_DATA[version - 1];
  const data = codewords(value, spec.data);
  const blocks: number[][] = [];
  const blockData = spec.data / spec.blocks;
  for (let i = 0; i < spec.blocks; i += 1) {
    const part = data.slice(i * blockData, (i + 1) * blockData);
    blocks.push([...part, ...ecc(part, spec.ecc)]);
  }
  const stream: number[] = [];
  for (let i = 0; i < spec.total / spec.blocks; i += 1) blocks.forEach((block) => stream.push(block[i]));
  const size = spec.size;
  const matrix = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && y >= 0 && x < size && y < size) matrix[y][x] = dark;
  };
  const finder = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 7; dy += 1) for (let dx = -1; dx <= 7; dx += 1) {
      const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFunction(cx + dx, cy + dy, dark);
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  const alignment = [6, 18, 22, 26, 30, 34][version - 1];
  if (version > 1) {
    const centers = [6, alignment];
    for (const cy of centers) for (const cx of centers) {
      if (matrix[cy]?.[cx] !== null) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  for (let i = 8; i < size - 8; i += 1) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }
  for (let i = 0; i < 15; i += 1) {
    if (i < 6) matrix[i][8] = false;
    else if (i < 8) matrix[i + 1][8] = false;
    else matrix[size - 15 + i][8] = false;
    if (i < 8) matrix[8][size - i - 1] = false;
    else if (i < 9) matrix[8][15 - i] = false;
    else matrix[8][15 - i - 1] = false;
  }
  matrix[size - 8][8] = true;
  const bits = stream.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) if (matrix[y][x] === null) {
        const bit = bitIndex < bits.length ? bits[bitIndex++] : 0;
        matrix[y][x] = Boolean(bit ^ ((x + y) % 2 === 0 ? 1 : 0));
      }
    }
    upward = !upward;
  }
  const format = 0b01000;
  let rem = format;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const formatBits = ((format << 10) | rem) ^ 0x5412;
  for (let i = 0; i < 15; i += 1) {
    const bit = Boolean((formatBits >>> i) & 1);
    if (i < 6) matrix[i][8] = bit;
    else if (i < 8) matrix[i + 1][8] = bit;
    else matrix[size - 15 + i][8] = bit;
    if (i < 8) matrix[8][size - i - 1] = bit;
    else if (i < 9) matrix[8][15 - i] = bit;
    else matrix[8][15 - i - 1] = bit;
  }
  return matrix.map((row) => row.map(Boolean));
}

export function qrSvgPath(value: string): { size: number; path: string } {
  const matrix = makeMatrix(value);
  const size = matrix.length;
  let path = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x},${y}h1v1H${x}z`; }));
  return { size, path };
}
