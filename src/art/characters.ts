// 人物像素小人（16×16），用代码按「发型/衣服/武器」拼出来。
// 这是临时美术：以后从原版 ROM 提取的行走图会替换掉这里。
import { ctx2d, flipX, grayscale, makeCanvas, outline, silhouette } from '../engine/pixel';

export type HairStyle = 'topknot' | 'scholar' | 'band' | 'straw' | 'bald' | 'wild' | 'bun' | 'fur' | 'long' | 'cap';
export type Weapon = 'none' | 'sword' | 'spear' | 'fan' | 'axes' | 'fork' | 'bow' | 'cane' | 'staff' | 'hoe';
export type Facing = 'down' | 'up' | 'left' | 'right';

export interface Look {
  skin: string;
  hair: string;
  style: HairStyle;
  hat?: string;
  beard?: string;
  cloth: string;
  trim?: string;
  belt?: string;
  pants?: string;
  shoes?: string;
  weapon?: Weapon;
  /** 长袍（看不到两条腿） */
  robe?: boolean;
  /** 胳膊上的刺青（史进） */
  tattoo?: string;
}

const EYE = '#1a1010';
const STEEL = '#e6ecf6';
const STEEL_DARK = '#9aa4b8';
const WOOD = '#8a5a2a';
const WOOD_DARK = '#5a3414';

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function drawHair(p: Px, look: Look, back: boolean) {
  const h = look.hair;
  const hat = look.hat ?? h;
  switch (look.style) {
    case 'topknot':
      p(5, 2, 6, 2, h);
      p(4, 3, 1, 2, h);
      p(11, 3, 1, 2, h);
      p(7, 0, 2, 2, h);
      if (look.hat) p(7, 2, 2, 1, hat);
      break;
    case 'scholar':
      p(4, 1, 8, 3, hat);
      p(5, 0, 6, 1, hat);
      p(4, 4, 1, 1, h);
      p(11, 4, 1, 1, h);
      p(back ? 7 : 11, back ? 4 : 1, back ? 2 : 1, back ? 3 : 1, hat);
      break;
    case 'band':
      p(5, 2, 6, 2, h);
      p(4, 3, 1, 3, h);
      p(11, 3, 1, 3, h);
      p(4, 3, 8, 1, hat);
      p(12, 3, 1, 2, hat);
      break;
    case 'straw':
      p(5, 3, 6, 1, h);
      p(2, 3, 12, 1, hat);
      p(4, 1, 8, 2, hat);
      p(6, 0, 4, 1, hat);
      p(3, 3, 10, 1, shade(hat));
      break;
    case 'bald':
      p(5, 2, 6, 1, look.skin);
      if (!back) p(6, 2, 2, 1, '#fff4dc');
      break;
    case 'wild':
      p(4, 1, 8, 3, h);
      p(3, 1, 1, 1, h);
      p(4, 0, 1, 1, h);
      p(7, 0, 1, 1, h);
      p(10, 0, 1, 1, h);
      p(12, 1, 1, 1, h);
      p(4, 4, 1, 2, h);
      p(11, 4, 1, 2, h);
      break;
    case 'bun':
      p(5, 2, 6, 2, h);
      p(4, 3, 1, 2, h);
      p(11, 3, 1, 2, h);
      p(6, 0, 4, 2, h);
      break;
    case 'fur':
      p(4, 1, 8, 3, hat);
      p(4, 3, 8, 1, tint(hat));
      p(5, 0, 6, 1, hat);
      break;
    case 'long':
      p(5, 2, 6, 2, h);
      p(4, 3, 1, 6, h);
      p(11, 3, 1, 6, h);
      if (look.hat) p(9, 1, 2, 1, hat);
      break;
    case 'cap':
      p(5, 1, 6, 2, hat);
      p(5, 3, 6, 1, h);
      break;
  }
}

function drawWeapon(p: Px, w: Weapon | undefined) {
  switch (w) {
    case 'sword':
      p(13, 4, 1, 7, STEEL);
      p(13, 9, 1, 2, STEEL_DARK);
      p(12, 11, 3, 1, '#c8a040');
      p(13, 12, 1, 2, WOOD_DARK);
      break;
    case 'spear':
      p(13, 2, 1, 13, WOOD);
      p(13, 0, 1, 2, STEEL);
      p(12, 2, 1, 1, '#d02020');
      p(14, 2, 1, 1, '#d02020');
      break;
    case 'fan':
      p(12, 8, 3, 3, '#f6f2e4');
      p(12, 8, 1, 1, '#c8c0a8');
      p(14, 10, 1, 1, '#c8c0a8');
      p(13, 11, 1, 1, WOOD);
      break;
    case 'axes':
      p(13, 7, 1, 6, WOOD_DARK);
      p(14, 7, 2, 3, STEEL);
      p(2, 7, 1, 6, WOOD_DARK);
      p(0, 7, 2, 3, STEEL);
      break;
    case 'fork':
      p(13, 3, 1, 12, WOOD);
      p(12, 3, 3, 1, STEEL_DARK);
      p(12, 0, 1, 3, STEEL);
      p(13, 0, 1, 3, STEEL);
      p(14, 0, 1, 3, STEEL);
      break;
    case 'bow':
      p(14, 4, 1, 1, WOOD);
      p(15, 5, 1, 5, WOOD);
      p(14, 10, 1, 1, WOOD);
      p(14, 5, 1, 5, '#e8e4d0');
      break;
    case 'cane':
      p(12, 10, 1, 6, WOOD);
      p(11, 10, 1, 1, WOOD);
      break;
    case 'staff':
      p(13, 1, 1, 14, WOOD);
      break;
    case 'hoe':
      p(13, 3, 1, 12, WOOD);
      p(12, 2, 3, 1, STEEL_DARK);
      break;
    default:
      break;
  }
}

function shade(hex: string) {
  return mix(hex, '#000000', 0.25);
}

function tint(hex: string) {
  return mix(hex, '#ffffff', 0.3);
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

function paint(look: Look, facing: Facing, frame: number): HTMLCanvasElement {
  if (facing === 'left') return flipX(paint(look, 'right', frame));
  const c = makeCanvas(16, 16);
  const ctx = ctx2d(c);
  const p: Px = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const back = facing === 'up';
  const shoes = look.shoes ?? '#2a1a10';
  const pants = look.pants ?? '#3a2a1a';
  const stride = frame === 1 ? 1 : 0;

  // 腿和脚
  if (look.robe) {
    p(4, 12, 8, 3, look.cloth);
    p(5 - stride, 15, 2, 1, shoes);
    p(9 + stride, 15, 2, 1, shoes);
  } else {
    p(5 - stride, 13, 2, 2, pants);
    p(9 + stride, 13, 2, 2, pants);
    p(5 - stride, 15, 2, 1, shoes);
    p(9 + stride, 15, 2, 1, shoes);
  }
  // 身体和胳膊
  p(4, 8, 8, 5, look.cloth);
  if (look.trim && !back) p(7, 8, 2, 4, look.trim);
  if (look.belt) p(4, 11, 8, 1, look.belt);
  const arm = look.tattoo ? look.skin : look.cloth;
  p(3, 9, 1, 3, arm);
  p(12, 9, 1, 3, arm);
  if (look.tattoo) {
    p(3, 10, 1, 1, look.tattoo);
    p(12, 9, 1, 1, look.tattoo);
    p(12, 11, 1, 1, look.tattoo);
  }
  p(3, 12, 1, 1, look.skin);
  p(12, 12, 1, 1, look.skin);
  // 头
  p(5, 3, 6, 5, look.skin);
  p(4, 4, 1, 2, look.skin);
  p(11, 4, 1, 2, look.skin);
  if (back) {
    p(5, 2, 6, 6, look.style === 'bald' ? look.skin : look.hair);
  } else {
    const ex = facing === 'right' ? 1 : 0;
    p(6 + ex, 5, 1, 1, EYE);
    p(9 + ex, 5, 1, 1, EYE);
    if (look.beard) {
      p(6 + ex, 7, 4, 2, look.beard);
      p(5, 6, 1, 2, look.beard);
      p(10, 6, 1, 2, look.beard);
    } else {
      p(7 + ex, 7, 2, 1, mix(look.skin, '#a04040', 0.35));
    }
  }
  drawHair(p, look, back);
  drawWeapon(p, look.weapon);
  return outline(c);
}

const cache = new WeakMap<Look, Map<string, HTMLCanvasElement>>();

function cached(look: Look, key: string, make: () => HTMLCanvasElement) {
  let m = cache.get(look);
  if (!m) cache.set(look, (m = new Map()));
  let c = m.get(key);
  if (!c) m.set(key, (c = make()));
  return c;
}

export function charSprite(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `${facing}${frame}`, () => paint(look, facing, frame));
}

export function charSpriteGray(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `g${facing}${frame}`, () => grayscale(charSprite(look, facing, frame)));
}

export function charSpriteFlash(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `w${facing}${frame}`, () => silhouette(charSprite(look, facing, frame)));
}
