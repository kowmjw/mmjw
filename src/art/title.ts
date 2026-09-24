// 标题画面的背景和火焰字纹理，照原版截图的构图用噪声现场生成：
// 淡紫色天空、远处绿色山峦、平原、前景金黄色岩石、右侧高耸的岩壁、底部一条水面。
import { ctx2d, makeCanvas } from '../engine/pixel';
import { hash2 } from '../engine/rng';

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function ridged(x: number, y: number, seed: number) {
  const r = 1 - Math.abs(fbm(x, y, seed) * 2 - 1);
  return r * r;
}

/** 用一张起伏的高度图算明暗（光从左上方来），让岩块有立体感。 */
function relief(x: number, y: number, seed: number) {
  const h = (px: number, py: number) => fbm(px / 14, py / 10, seed, 3);
  const slope = h(x - 1.5, y - 1.5) - h(x + 1.5, y + 1.5);
  return 0.3 + slope * 3.2 + (h(x, y) - 0.5) * 0.3;
}

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 按 t（0~1）从色板里挑一个颜色（不插值，保持像素画的色阶感）。 */
function pick(palette: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(palette.length - 1, Math.floor(t * palette.length)));
  return palette[i];
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const SKY_TOP = rgb('#c9c4dc');
const SKY_LOW = rgb('#e6e2ee');
const MOUNT = ['#5a6a32', '#728446', '#8c9c5c', '#a6b476', '#c2cc96'].map(rgb);
const PLAIN = ['#86924a', '#96a256', '#a6b064', '#b4bc72'].map(rgb);
const ROCK = ['#1e1c0a', '#383414', '#56501e', '#78702e', '#a09242', '#c6b65c', '#e2d488'].map(rgb);
const CLIFF = ['#1a1c0e', '#323418', '#4c4e24', '#6a6a34', '#8c8846', '#b2a85e', '#d2c882'].map(rgb);
const WATER = ['#90acd0', '#a8c2e0', '#d4e4f4'].map(rgb);

export function renderTitleBackground(): HTMLCanvasElement {
  const W = 320;
  const H = 224;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const ridge = 54 + 16 * fbm(x / 60, 0.5, 11) + 8 * fbm(x / 18, 1.5, 12);
    const plainTop = 104 + 5 * fbm(x / 40, 2.5, 13);
    const rockTop = 142 + 24 * fbm(x / 34, 3.5, 14);
    const cliffTop = 68 + 12 * fbm(x / 14, 5.5, 16);
    for (let y = 0; y < H; y++) {
      const cliffX = 214 + 16 * fbm(y / 22, 4.5, 15) + Math.max(0, 110 - y) * 0.35;
      let col: RGB;
      if (y >= 212 + 2 * fbm(x / 9, 6.5, 17)) {
        col = pick(WATER, fbm(x / 3, y / 1.2, 18));
      } else if (x > cliffX && y > cliffTop) {
        const lit = Math.max(0, 1 - (x - cliffX) / 26) * 0.25;
        col = pick(CLIFF, ridged(x / 4, y / 6, 21) * 0.6 + relief(x, y, 22) + lit - 0.14);
      } else if (y > rockTop) {
        const depth = (y - rockTop) / (H - rockTop);
        col = pick(ROCK, ridged(x / 4.5, y / 4, 23) * 0.6 + relief(x, y, 24) - 0.06 - depth * 0.12);
      } else if (y > plainTop) {
        col = pick(PLAIN, fbm(x / 30, y / 2.2, 19) * 0.8 + ((y - plainTop) / (rockTop - plainTop)) * 0.25);
        if (hash2(x, y, 25) < 0.04) col = PLAIN[0];
      } else if (y > ridge) {
        const n = ridged(x / 10, y / 6, 20);
        const top = 1 - (y - ridge) / (plainTop - ridge);
        col = pick(MOUNT, n * 0.7 + top * 0.3);
      } else {
        col = lerp(SKY_TOP, SKY_LOW, y / ridge);
        const cloud = fbm(x / 50, y / 7, 26);
        if (cloud > 0.62) col = lerp(col, [248, 246, 252], (cloud - 0.62) * 2);
      }
      const i = (y * W + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const FIRE = ['#fffcb0', '#fff070', '#ffd638', '#ffa820', '#f87818', '#e04c10', '#b82a08'].map(rgb);

/** 标题字的火焰纹理：上黄下红，带斑驳的噪声。 */
export function renderFireTexture(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (y / h) * 0.55 + fbm(x / 7, y / 7, 31) * 0.65 + fbm(x / 2.5, y / 2.5, 32, 2) * 0.2 - 0.2;
      const col = pick(FIRE, t);
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
