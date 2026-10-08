// 新写的文字（剧情台词、界面说明）用的 16×16 点阵字，字形来自 GNU Unifont，
// 由 tools/font/build_pixel_font.py 只收录用到的字，生成 src/generated/pixelfont.ts。
// 原版 ROM 里有的名字（人物、职业、道具）直接用 ROM 字库画，见 romtext.ts。

import { makeCanvas } from '../engine/pixel';
import { FONT_CHARS, FONT_DATA, FONT_WIDE } from '../generated/pixelfont';

const COLS = 64;
const chars = [...FONT_CHARS];
const index = new Map<string, number>();
chars.forEach((c, i) => index.set(c, i));

let bits: Uint8Array | null = null;
function glyphData() {
  if (!bits) {
    const bin = atob(FONT_DATA);
    bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  }
  return bits;
}

const atlases = new Map<string, HTMLCanvasElement>();
const warned = new Set<string>();

/** 某种颜色的整张字图（64 字一行）。 */
function atlas(color: string) {
  let c = atlases.get(color);
  if (c) return c;
  const data = glyphData();
  const rows = Math.ceil(chars.length / COLS);
  c = makeCanvas(COLS * 16, rows * 16);
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  const px = img.data;
  for (let i = 0; i < chars.length; i++) {
    const ox = (i % COLS) * 16;
    const oy = Math.floor(i / COLS) * 16;
    for (let y = 0; y < 16; y++) {
      const row = (data[i * 32 + y * 2] << 8) | data[i * 32 + y * 2 + 1];
      for (let x = 0; x < 16; x++) {
        if (!(row & (0x8000 >> x))) continue;
        const p = ((oy + y) * c.width + ox + x) * 4;
        px[p] = r;
        px[p + 1] = gg;
        px[p + 2] = b;
        px[p + 3] = 255;
      }
    }
  }
  g.clearRect(0, 0, 1, 1);
  g.putImageData(img, 0, 0);
  atlases.set(color, c);
  return c;
}

export function hasGlyph(ch: string) {
  return index.has(ch);
}

/** 一个字的宽度：全角 16，半角 8；没收录的字按 16 算。 */
export function charWidth(ch: string) {
  const i = index.get(ch);
  if (i === undefined) return ch === '　' ? 16 : ch.charCodeAt(0) < 0x80 ? 8 : 16;
  return FONT_WIDE[i] === '1' ? 16 : 8;
}

export function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

export interface PixelTextOpts {
  /** 描一圈这个颜色的边（1 像素，四个方向） */
  outline?: string;
  /** 右下错开 1 像素的影子 */
  shadow?: string;
  /** 只画前 n 个字（逐字显示用） */
  limit?: number;
}

/** 画一行字，(x,y) 是左上角，返回画出的宽度。 */
export function drawPixelText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#000', opts: PixelTextOpts = {}): number {
  x = Math.round(x);
  y = Math.round(y);
  if (opts.outline) {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) drawRaw(ctx, s, x + dx, y + dy, opts.outline, opts.limit);
  } else if (opts.shadow) {
    drawRaw(ctx, s, x + 1, y + 1, opts.shadow, opts.limit);
  }
  return drawRaw(ctx, s, x, y, color, opts.limit);
}

function drawRaw(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, limit = Infinity) {
  const a = atlas(color);
  let cx = x;
  let n = 0;
  for (const ch of s) {
    if (n++ >= limit) break;
    const i = index.get(ch);
    const w = charWidth(ch);
    if (i === undefined) {
      if (ch !== ' ' && ch !== '　' && !warned.has(ch)) {
        warned.add(ch);
        console.warn(`点阵字库里没有「${ch}」，请重新运行 tools/font/build_pixel_font.py`);
      }
    } else {
      ctx.drawImage(a, (i % COLS) * 16, Math.floor(i / COLS) * 16, w, 16, cx, y, w, 16);
    }
    cx += w;
  }
  return cx - x;
}

// 这些标点不放在行首
const NO_LINE_START = '，。！？、；：”’）》」』…—,.!?;:)';

/** 按像素宽度折行（中文逐字折，标点不放行首），保留手动换行。 */
export function wrapPixelText(s: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    let w = 0;
    for (const ch of para) {
      const cw = charWidth(ch);
      if (line && w + cw > maxWidth && !NO_LINE_START.includes(ch)) {
        out.push(line);
        line = '';
        w = 0;
      }
      line += ch;
      w += cw;
    }
    out.push(line);
  }
  return out;
}
