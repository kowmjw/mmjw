// MD 画面数据的解码：颜色、4bpp 图块、版面字。输出到 RGBA 像素缓冲（纯逻辑），
// 再由 canvas.ts 转成浏览器画布。

import { ADDR, RomData } from './data';

/** MD 颜色 0000BBB0GGG0RRR0 → 0xAABBGGRR（小端机器上 ImageData 的 Uint32 格式）。 */
export function mdColor(w: number, alpha = 255) {
  const r = Math.round((((w >> 1) & 7) * 255) / 7);
  const g = Math.round((((w >> 5) & 7) * 255) / 7);
  const b = Math.round((((w >> 9) & 7) * 255) / 7);
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** 读 n 个颜色；每行第 0 色在图块里表示透明，这里照样给出颜色，画的时候再决定。 */
export function readPalette(rom: RomData, a: number, n: number) {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = mdColor(rom.u16(a + i * 2));
  return out;
}

export class PixelBuf {
  readonly px: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(w * h);
  }

  fill(color: number) {
    this.px.fill(color);
  }
}

/**
 * 把一个 8×8 图块画进缓冲。data 是图块数据所在的数组，at 是这个图块的字节偏移。
 * pal 是完整的 64 色（4 行），line 选行；transparent 时 0 号色不画。
 */
export function blitTile(
  buf: PixelBuf,
  data: Uint8Array,
  at: number,
  x: number,
  y: number,
  pal: Uint32Array,
  line: number,
  hflip = false,
  vflip = false,
  transparent = true,
) {
  const base = line * 16;
  for (let row = 0; row < 8; row++) {
    const ty = y + (vflip ? 7 - row : row);
    if (ty < 0 || ty >= buf.h) continue;
    const src = at + row * 4;
    for (let col = 0; col < 8; col++) {
      const byte = data[src + (col >> 1)];
      const c = col & 1 ? byte & 15 : byte >> 4;
      if (c === 0 && transparent) continue;
      const tx = x + (hflip ? 7 - col : col);
      if (tx < 0 || tx >= buf.w) continue;
      buf.px[ty * buf.w + tx] = pal[base + c];
    }
  }
}

/** 一个版面字：图块号、调色板行、翻转、优先级。 */
export function nameEntry(v: number) {
  return { tile: v & 0x7ff, line: (v >> 13) & 3, hflip: (v & 0x800) !== 0, vflip: (v & 0x1000) !== 0, pri: (v & 0x8000) !== 0 };
}

/**
 * 模拟一块显存：tiles 是按图块号排好的数据（tile n 在 n*32 字节处）。
 * 用来画标题画面这种「先把图块读进显存，再按版面摆」的东西。
 */
export class Vram {
  readonly data = new Uint8Array(0x10000);

  load(src: Uint8Array, firstTile: number) {
    const at = firstTile * 32;
    this.data.set(src.subarray(0, Math.max(0, Math.min(src.length, this.data.length - at))), at);
  }

  /** 按版面（w×h 个字，行优先）画到缓冲的 (x,y) 处。skipZero：图块号 0 的格子跳过。 */
  drawNames(buf: PixelBuf, rom: RomData, at: number, w: number, h: number, x: number, y: number, pal: Uint32Array, opts: { transparent?: boolean; skipZero?: boolean; rowOffset?: number; rows?: number } = {}) {
    const rows = opts.rows ?? h;
    const r0 = opts.rowOffset ?? 0;
    for (let ry = 0; ry < rows; ry++) {
      const srcRow = (r0 + ry) % h;
      for (let cx = 0; cx < w; cx++) {
        const e = nameEntry(rom.u16(at + (srcRow * w + cx) * 2));
        if (opts.skipZero && e.tile === 0) continue;
        blitTile(buf, this.data, e.tile * 32, x + cx * 8, y + ry * 8, pal, e.line, e.hflip, e.vflip, opts.transparent ?? false);
      }
    }
  }
}

/** 人物调色板（第 2 行那 16 色），人物行走图和头像共用。 */
export function peoplePalette(rom: RomData) {
  const p = new Uint32Array(64);
  p.set(readPalette(rom, ADDR.peoplePalette, 16), 0);
  return p;
}

/** 按列排列的 cols×rows 个图块（行走图 4×4、头像 6×6）画到缓冲。 */
export function blitColumnMajor(buf: PixelBuf, data: Uint8Array, at: number, cols: number, rows: number, x: number, y: number, pal: Uint32Array, flip = false) {
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const dc = flip ? cols - 1 - c : c;
      blitTile(buf, data, at + (c * rows + r) * 32, x + dc * 8, y + r * 8, pal, 0, flip, false, true);
    }
  }
}

/** 16×16 单色字：左上、右上、左下、右下四个 8×8 块，每块 8 字节，最高位在左。返回 256 个 0/1。 */
export function glyphBits(rom: RomData, bank: number, code: number) {
  const a = rom.u32(ADDR.font + bank * 4) + code * 32;
  const out = new Uint8Array(256);
  for (let t = 0; t < 4; t++) {
    const ox = (t & 1) * 8;
    const oy = (t >> 1) * 8;
    for (let y = 0; y < 8; y++) {
      const v = rom.u8(a + t * 8 + y);
      for (let x = 0; x < 8; x++) if ((v >> (7 - x)) & 1) out[(oy + y) * 16 + ox + x] = 1;
    }
  }
  return out;
}
