// 对话头像（48×48 半身像），按人物的发型、眉眼、胡子、衣服用代码画出来。
// 先用平滑的形状画，再把每个像素吸附到用过的颜色上、描一圈轮廓，得到干净的像素画。
// 这是临时美术：以后换成原版 ROM 里的头像。
import { ctx2d, makeCanvas, outline } from '../engine/pixel';
import type { Look } from './characters';

export const PORTRAIT_SIZE = 48;

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  const m = (i: number) => Math.round(x[i] * (1 - t) + y[i] * t);
  return `#${((m(0) << 16) | (m(1) << 8) | m(2)).toString(16).padStart(6, '0')}`;
}

const shade = (hex: string, t: number) => mix(hex, '#000000', t);
const tint = (hex: string, t: number) => mix(hex, '#ffffff', t);

/** 把抗锯齿边缘去掉：透明度过半的像素变成不透明，颜色吸附到最近的已用颜色。 */
function pixelize(c: HTMLCanvasElement, colors: string[]) {
  const ctx = ctx2d(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const pal = colors.map(rgb);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) {
      d[i + 3] = 0;
      continue;
    }
    let best = pal[0];
    let bestD = Infinity;
    for (const p of pal) {
      const dist = (p[0] - d[i]) ** 2 + (p[1] - d[i + 1]) ** 2 + (p[2] - d[i + 2]) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = p;
      }
    }
    d[i] = best[0];
    d[i + 1] = best[1];
    d[i + 2] = best[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function paint(look: Look): HTMLCanvasElement {
  const c = makeCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
  const ctx = ctx2d(c);
  const used = new Set<string>();
  const fill = (color: string, shape: () => void) => {
    used.add(color);
    ctx.fillStyle = color;
    ctx.beginPath();
    shape();
    ctx.fill();
  };
  const poly =
    (...pts: number[]) =>
    () => {
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    };
  const oval = (cx: number, cy: number, rx: number, ry: number) => () => ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const box = (x: number, y: number, w: number, h: number) => () => ctx.rect(x, y, w, h);

  const skin = look.skin;
  const skinShade = shade(skin, 0.16);
  const skinDeep = shade(skin, 0.34);
  const hair = look.hair;
  const hairLight = tint(hair, 0.28);
  const hat = look.hat ?? hair;
  const cloth = look.cloth;
  const clothShade = shade(cloth, 0.3);
  const trim = look.trim ?? tint(cloth, 0.4);
  const light = rgb(hair).reduce((a, b) => a + b, 0) > 500;
  const browColor = light ? shade(hair, 0.45) : shade(hair, 0.3);
  const INK = '#2a1a14';
  const WHITE = '#f6f2ea';
  const MOUTH = '#8a3a34';
  const MOUTH_IN = '#5a1a14';

  // ── 背后的东西：武器、长发、蓬乱的头发 ──
  if (look.weapon === 'spear') {
    fill('#8a5a2a', poly(38, 6, 40, 6, 33, 48, 31, 48));
    fill('#e6ecf6', poly(38, 0, 42, 0, 41, 7, 38, 7));
    fill('#d02020', poly(36, 7, 42, 7, 41, 10, 37, 10));
  }
  if (look.weapon === 'axes') {
    // 板斧：斧柄斜靠在肩后，斧刃是一道弧
    fill('#5a3414', poly(37, 10, 39.5, 10, 34, 48, 31.5, 48));
    fill('#9aa4b8', poly(36, 9, 44, 4, 47, 9, 47.5, 15, 45, 20, 38, 16));
    fill('#e6ecf6', poly(44, 4, 47, 9, 47.5, 15, 45, 20, 43.5, 18, 45.5, 13, 45, 8.5, 42.5, 5.5));
  }
  if (look.style === 'long') fill(hair, poly(12, 16, 36, 16, 38, 40, 34, 44, 14, 44, 10, 40));
  if (look.style === 'wild') {
    const pts: number[] = [];
    for (let a = 170; a <= 370; a += 12) {
      const r = (a / 12) % 2 < 1 ? 16.5 : 12.5;
      pts.push(24 + Math.cos((a * Math.PI) / 180) * r, 21 + Math.sin((a * Math.PI) / 180) * r);
    }
    pts.push(38, 34, 10, 34);
    fill(hair, poly(...pts));
  }

  // ── 肩膀和衣服 ──
  fill(cloth, poly(3, 48, 7, 39, 15, 35, 33, 35, 41, 39, 45, 48));
  fill(clothShade, poly(31, 35, 33, 35, 41, 39, 45, 48, 35, 48));
  fill(skinShade, box(20, 28, 8, 9));
  fill(trim, poly(16, 35, 24, 46, 32, 35));
  if (trim !== skin) fill(skinShade, poly(20, 35, 24, 41, 28, 35));
  if (look.tattoo) {
    // 史进身上的青龙刺青
    for (const [x, y, w, h] of [
      [21, 37, 2, 1],
      [23, 38, 1, 2],
      [25, 37, 2, 1],
      [26, 36, 1, 1],
      [8, 41, 3, 1],
      [11, 40, 1, 2],
      [12, 42, 2, 1],
      [36, 41, 3, 1],
      [35, 40, 1, 1],
    ])
      fill(look.tattoo, box(x, y, w, h));
  }

  // ── 头和脸 ──
  fill(skin, oval(24, 21, 10.5, 11));
  fill(skin, poly(13.6, 22, 15.2, 30, 20, 34.6, 28, 34.6, 32.8, 30, 34.4, 22));
  fill(skinShade, poly(31, 16, 34.6, 22, 33, 30, 28, 34.6, 26.5, 34, 30.6, 28, 31.8, 22));
  fill(skin, oval(13.2, 24, 1.8, 3));
  fill(skinShade, oval(34.8, 24, 1.8, 3));

  // 眼睛
  const eyes = look.eyes ?? 'normal';
  for (const cx of [19.5, 28.5]) {
    if (eyes === 'round') {
      fill(WHITE, oval(cx, 24, 2.4, 2.3));
      fill(INK, oval(cx, 24.2, 1.3, 1.4));
    } else if (eyes === 'narrow') {
      fill(WHITE, box(cx - 2, 23.6, 4, 1.6));
      fill(INK, box(cx - 1, 23.6, 2, 1.6));
      fill(INK, box(cx - 2.5, 22.6, 5, 1));
    } else if (eyes === 'old') {
      fill(INK, box(cx - 2.5, 23.8, 5, 1));
      fill(skinDeep, box(cx - 1.5, 25.6, 3, 0.9));
    } else {
      fill(WHITE, box(cx - 2, 23, 4, 2.6));
      fill(INK, box(cx - 1, 23, 2, 2.6));
      fill(INK, box(cx - 2.5, 22.1, 5, 1));
      fill(WHITE, box(cx - 1, 23, 1, 1));
    }
  }
  // 眉毛
  const brow = look.brow ?? 'calm';
  if (brow === 'fierce') {
    fill(browColor, poly(15.5, 18, 22, 20.4, 22, 21.9, 15.5, 19.8));
    fill(browColor, poly(26, 20.4, 32.5, 18, 32.5, 19.8, 26, 21.9));
  } else if (brow === 'raised') {
    fill(browColor, poly(16, 20.2, 21.5, 18.4, 21.5, 19.8, 16, 21.4));
    fill(browColor, poly(26.5, 18.4, 32, 20.2, 32, 21.4, 26.5, 19.8));
  } else {
    fill(browColor, box(16.5, 19.4, 5, 1.5));
    fill(browColor, box(26.5, 19.4, 5, 1.5));
  }
  // 鼻子
  fill(skinDeep, box(23.5, 26, 1, 2));
  fill(skinShade, box(24.5, 27.6, 1.2, 0.9));
  // 脸上的记号（刘唐的朱砂记）
  if (look.mark) fill(look.mark, oval(29.6, 28.2, 2.8, 2));
  // 嘴
  const mouth = look.mouth ?? 'flat';
  const drawMouth = () => {
    if (mouth === 'open') {
      fill(MOUTH_IN, oval(24, 31.2, 2.4, 1.7));
      fill(WHITE, box(22.4, 30, 3.2, 0.9));
    } else if (mouth === 'smile') {
      fill(MOUTH, poly(21, 30, 24, 31.4, 27, 30, 27, 31.2, 24, 32.6, 21, 31.2));
    } else {
      fill(MOUTH, box(21.6, 30.6, 4.8, 1.1));
    }
  };
  drawMouth();
  // 胡子
  if (look.beard) {
    const b = look.beard;
    const style = look.beardStyle ?? 'full';
    if (style === 'full') {
      fill(b, poly(14.4, 25, 15.4, 31, 19, 36.5, 24, 39, 29, 36.5, 32.6, 31, 33.6, 25, 31, 28.5, 28, 31.5, 20, 31.5, 17, 28.5));
      fill(b, poly(19.6, 29.4, 24, 28.6, 28.4, 29.4, 28.4, 30.8, 24, 30.2, 19.6, 30.8));
      drawMouth();
    } else if (style === 'goatee') {
      fill(b, poly(20.5, 29.2, 24, 28.8, 27.5, 29.2, 27.5, 29.9, 24, 29.6, 20.5, 29.9));
      fill(b, poly(22.4, 33.2, 25.6, 33.2, 25, 38, 24, 39.5, 23, 38));
    } else {
      fill(b, poly(16, 28, 19, 33.4, 24, 35.4, 29, 33.4, 32, 28, 29, 31.6, 24, 33, 19, 31.6));
    }
  }

  // ── 头发和帽子 ──
  const cap = () => fill(hair, poly(13, 24, 13.4, 16, 17, 11, 24, 9.6, 31, 11, 34.6, 16, 35, 24, 33.2, 24, 32.6, 18, 28, 16, 24, 15.6, 20, 16, 15.4, 18, 14.8, 24));
  switch (look.style) {
    case 'topknot':
      cap();
      fill(hairLight, poly(18, 12.4, 24, 11.2, 21, 13.6));
      fill(hair, oval(24, 7.4, 4.6, 4));
      fill(hairLight, oval(22.6, 6.2, 1.6, 1));
      fill(hat, box(20, 9.6, 8, 2));
      break;
    case 'scholar':
      cap();
      fill(shade(hat, 0.25), poly(34, 13, 38.5, 15, 39.5, 30, 36.5, 31, 35, 18));
      fill(shade(hat, 0.25), poly(14, 13, 9.5, 15, 8.5, 30, 11.5, 31, 13, 18));
      fill(hat, poly(13, 17, 13.4, 10, 17, 4.6, 31, 4.6, 34.6, 10, 35, 17, 31, 15.4, 24, 15, 17, 15.4));
      fill(tint(hat, 0.22), box(15, 9, 18, 1.2));
      break;
    case 'band':
      fill(hair, poly(13, 24, 13, 15, 16, 10, 18.5, 6, 21, 9, 24, 4.5, 27, 9, 29.5, 6, 32, 10, 35, 15, 35, 24, 33.2, 24, 33, 19, 29, 17.6, 24, 17, 19, 17.6, 15, 19, 14.8, 24));
      fill(hat, poly(12.8, 16.4, 35.2, 16.4, 35.2, 19, 12.8, 19));
      fill(hat, poly(34, 17, 41.5, 14.5, 43.5, 19, 38.5, 21.5, 34, 19.4));
      break;
    case 'wild': {
      const pts: number[] = [];
      for (let a = 190; a <= 350; a += 10) {
        const r = (a / 10) % 2 < 1 ? 13.4 : 11.2;
        pts.push(24 + Math.cos((a * Math.PI) / 180) * r, 20 + Math.sin((a * Math.PI) / 180) * r);
      }
      pts.push(35, 22, 32, 17.6, 24, 15.4, 16, 17.6, 13, 22);
      fill(hair, poly(...pts));
      fill(hairLight, poly(19, 11, 23, 9.6, 21.4, 12.4));
      break;
    }
    case 'bald':
      fill(tint(skin, 0.45), oval(19.6, 13, 3, 1.5));
      break;
    case 'straw':
      fill(skinShade, box(14, 15.6, 20, 3.4));
      fill(hat, poly(1, 17.6, 47, 17.6, 33, 7, 24, 2.6, 15, 7));
      fill(shade(hat, 0.3), box(3, 16.4, 42, 1.6));
      fill(tint(hat, 0.25), poly(17, 10, 24, 5, 21, 11));
      break;
    case 'bun':
      cap();
      fill(hair, oval(24, 7.6, 5, 4.2));
      fill('#c8a040', box(27, 5.6, 7, 1.2));
      break;
    case 'fur':
      fill(hat, oval(24, 12, 12.8, 8));
      for (const [x, y] of [
        [16, 9],
        [21, 7],
        [27, 8],
        [31, 11],
        [19, 13],
        [25, 12],
      ])
        fill(shade(hat, 0.3), box(x, y, 1.5, 1));
      fill(tint(hat, 0.35), box(11.4, 15.6, 25.2, 3.2));
      break;
    case 'long':
      fill(hair, poly(13, 26, 13, 14, 17, 9, 24, 7.6, 31, 9, 35, 14, 35, 26, 33.2, 26, 32.6, 19, 30, 16, 26, 18, 24, 16, 21, 18, 18, 16, 15.4, 19, 14.8, 26));
      fill(hair, poly(12, 20, 16, 22, 17, 40, 12, 42));
      fill(hair, poly(36, 20, 32, 22, 31, 40, 36, 42));
      fill(hat, oval(32.6, 10.2, 2.4, 2.4));
      fill('#fff4c0', box(32, 9.6, 1.2, 1.2));
      break;
    case 'cap':
      cap();
      fill(hat, poly(13, 17, 14, 10, 18, 6.4, 30, 6.4, 34, 10, 35, 17, 24, 15.4));
      fill(shade(hat, 0.3), box(13, 15, 22, 2));
      break;
  }

  // ── 手里的东西（吴用的羽扇） ──
  if (look.weapon === 'fan') {
    fill('#f4f0e0', poly(3, 35, 11, 30, 18, 33, 16, 44, 10, 47, 4, 44));
    fill('#c8c0a8', poly(10, 32, 11, 32, 12, 45, 11, 45));
    fill('#8a5a2a', box(14.6, 42, 2, 6));
  }

  pixelize(c, [...used]);
  return outline(c, [26, 16, 10]);
}

const cache = new WeakMap<Look, HTMLCanvasElement>();

export function portrait(look: Look) {
  let c = cache.get(look);
  if (!c) cache.set(look, (c = paint(look)));
  return c;
}
