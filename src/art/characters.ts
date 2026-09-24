// 人物行走图（16×16，四个方向，站立 + 两个迈步帧），用代码按「发型/衣服/武器」拼出来。
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
  // 以下只影响对话头像
  /** 眉毛：平/凶/上扬 */
  brow?: 'calm' | 'fierce' | 'raised';
  /** 眼睛：普通/圆瞪/细长/老人 */
  eyes?: 'normal' | 'round' | 'narrow' | 'old';
  /** 胡子样式（有 beard 颜色时才画） */
  beardStyle?: 'full' | 'goatee' | 'short';
  mouth?: 'flat' | 'smile' | 'open';
  /** 脸上的记号颜色（刘唐的朱砂记） */
  mark?: string;
}

const EYE = '#1a1010';
const STEEL = '#e6ecf6';
const STEEL_DARK = '#9aa4b8';
const WOOD = '#8a5a2a';
const WOOD_DARK = '#5a3414';
const GOLD = '#d8b040';

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

const shade = (hex: string, t = 0.28) => mix(hex, '#000000', t);
const tint = (hex: string, t = 0.3) => mix(hex, '#ffffff', t);

type View = 'front' | 'side' | 'back';
type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** 头的轮廓（8×8，圆角），按行给出 x 范围。 */
const HEAD_ROWS: [number, number, number][] = [
  [1, 6, 9],
  [2, 5, 10],
  [3, 4, 11],
  [4, 4, 11],
  [5, 4, 11],
  [6, 4, 11],
  [7, 4, 11],
  [8, 5, 10],
];

function drawLegs(p: Px, look: Look, view: View, frame: number) {
  const cloth = look.cloth;
  const pants = look.pants ?? '#3a2a1a';
  const shoes = look.shoes ?? '#2a1a10';
  if (view === 'side') {
    const near = look.robe ? cloth : pants;
    const far = shade(near, 0.3);
    if (look.robe) p(5, 13, 5, 2, cloth);
    if (frame === 0) {
      if (!look.robe) p(6, 13, 3, 2, near);
      p(6, 15, 4, 1, shoes);
    } else {
      const [fx, bx] = frame === 1 ? [8, 5] : [7, 6];
      if (!look.robe) {
        p(bx, 13, 2, 2, far);
        p(fx, 13, 2, 2, near);
      }
      p(bx - 1, 15, 3, 1, shoes);
      p(fx, 15, 3, 1, shoes);
    }
    return;
  }
  // 正面、背面：frame 1 抬左脚，frame 2 抬右脚
  const lift = (left: boolean) => (frame === 1 && left) || (frame === 2 && !left);
  if (look.robe) {
    p(5, 13, 6, 2, cloth);
    p(10, 13, 1, 2, shade(cloth));
    if (!lift(true)) p(5, 15, 2, 1, shoes);
    if (!lift(false)) p(9, 15, 2, 1, shoes);
    return;
  }
  for (const [x, left] of [
    [5, true],
    [9, false],
  ] as [number, boolean][]) {
    const color = left ? pants : shade(pants, 0.25);
    if (lift(left)) {
      p(x, 13, 2, 1, color);
      p(x, 14, 2, 1, shoes);
    } else {
      p(x, 13, 2, 2, color);
      p(x, 15, 2, 1, shoes);
    }
  }
}

function drawBody(p: Px, look: Look, view: View, frame: number) {
  const cloth = look.cloth;
  const dark = shade(cloth);
  const arm = look.tattoo ? look.skin : cloth;
  const armDark = look.tattoo ? shade(look.skin, 0.15) : dark;
  if (view === 'side') {
    p(6, 9, 4, 4, cloth);
    p(6, 9, 1, 4, dark);
    if (look.trim) p(9, 9, 1, 2, look.trim);
    if (look.belt) p(6, 11, 4, 1, look.belt);
    // 胳膊前后摆
    if (frame === 0) {
      p(7, 9, 2, 3, armDark);
      p(8, 12, 1, 1, look.skin);
    } else if (frame === 1) {
      p(8, 9, 2, 2, armDark);
      p(10, 10, 1, 1, look.skin);
    } else {
      p(6, 9, 2, 2, armDark);
      p(5, 10, 1, 1, look.skin);
    }
    if (look.tattoo) p(8, 10, 1, 1, look.tattoo);
    return;
  }
  p(5, 9, 6, 4, cloth);
  p(10, 9, 1, 4, dark);
  if (view === 'front' && look.trim) p(7, 9, 2, 2, look.trim);
  if (look.belt) p(5, 11, 6, 1, look.belt);
  // 两条胳膊，迈步时前后摆
  const leftUp = frame === 1;
  const rightUp = frame === 2;
  p(4, 9, 1, leftUp ? 2 : 3, arm);
  p(4, leftUp ? 11 : 12, 1, 1, look.skin);
  p(11, 9, 1, rightUp ? 2 : 3, armDark);
  p(11, rightUp ? 11 : 12, 1, 1, look.skin);
  if (look.tattoo) {
    p(4, 10, 1, 1, look.tattoo);
    p(11, 9, 1, 1, look.tattoo);
  }
}

function drawHead(p: Px, look: Look, view: View) {
  const skin = look.skin;
  const skinDark = shade(skin, 0.18);
  for (const [y, x0, x1] of HEAD_ROWS) p(x0, y, x1 - x0 + 1, 1, skin);
  if (view === 'front') {
    p(11, 5, 1, 3, skinDark);
    p(6, 5, 1, 2, EYE);
    p(9, 5, 1, 2, EYE);
    if (!look.beard) p(7, 7, 2, 1, mix(skin, '#a04040', 0.35));
  } else if (view === 'side') {
    p(8, 5, 1, 2, skinDark);
    p(10, 5, 1, 2, EYE);
    p(12, 6, 1, 1, skin);
    if (!look.beard) p(11, 7, 1, 1, mix(skin, '#a04040', 0.35));
  }
}

function drawBeard(p: Px, look: Look, view: View) {
  const b = look.beard;
  if (!b || view === 'back') return;
  const style = look.beardStyle ?? 'full';
  if (view === 'front') {
    if (style === 'full') {
      p(4, 6, 1, 1, b);
      p(11, 6, 1, 1, b);
      p(5, 7, 6, 2, b);
      p(6, 9, 4, 1, b);
    } else if (style === 'goatee') {
      p(7, 8, 2, 2, b);
    } else {
      p(5, 8, 6, 1, shade(b, 0.1));
    }
  } else if (style === 'full') {
    p(8, 7, 4, 1, b);
    p(7, 8, 4, 1, b);
    p(8, 9, 3, 1, b);
  } else if (style === 'goatee') {
    p(10, 8, 2, 2, b);
  } else {
    p(8, 8, 3, 1, shade(b, 0.1));
  }
}

/** 通用的头发：前面露出脸，侧面盖住后脑勺，背面盖满。 */
function hairCap(p: Px, color: string, view: View) {
  p(6, 1, 4, 1, color);
  p(5, 2, 6, 1, color);
  p(4, 3, 8, 1, color);
  if (view === 'front') {
    p(4, 4, 1, 2, color);
    p(11, 4, 1, 2, color);
    p(5, 4, 1, 1, color);
    p(10, 4, 1, 1, color);
  } else if (view === 'side') {
    p(4, 4, 4, 3, color);
    p(4, 7, 3, 1, color);
    p(5, 8, 2, 1, color);
  } else {
    for (const [y, x0, x1] of HEAD_ROWS) if (y >= 4) p(x0, y, x1 - x0 + 1, 1, color);
    p(5, 6, 6, 2, shade(color, 0.2));
  }
}

function drawHair(p: Px, look: Look, view: View) {
  const h = look.hair;
  const hat = look.hat ?? h;
  const back = view === 'back';
  const side = view === 'side';
  switch (look.style) {
    case 'topknot':
      hairCap(p, h, view);
      p(side ? 6 : 7, 0, 2, 1, h);
      p(side ? 6 : 7, 1, 2, 1, look.hat ?? h);
      if (!back) p(6, 2, 2, 1, tint(h, 0.2));
      break;
    case 'scholar':
      hairCap(p, h, view);
      p(6, 1, 4, 1, hat);
      p(5, 2, 6, 1, hat);
      p(4, 3, 8, 1, hat);
      p(6, 2, 3, 1, tint(hat, 0.2));
      if (back) {
        p(6, 4, 1, 5, shade(hat));
        p(9, 4, 1, 5, shade(hat));
      } else if (side) {
        p(4, 4, 2, 2, hat);
        p(3, 4, 1, 4, shade(hat));
      }
      break;
    case 'band':
      hairCap(p, h, view);
      p(6, 0, 1, 1, h);
      p(9, 0, 1, 1, h);
      p(4, 3, 8, 1, hat);
      if (back) p(7, 4, 2, 2, hat);
      else if (side) p(2, 3, 2, 2, hat);
      else p(12, 3, 1, 2, hat);
      break;
    case 'straw':
      if (back) hairCap(p, h, view);
      p(6, 1, 4, 1, hat);
      p(4, 2, 8, 1, hat);
      p(1, 3, 14, 1, tint(hat, 0.15));
      p(2, 4, 12, 1, shade(hat, 0.3));
      p(6, 2, 2, 1, tint(hat, 0.35));
      break;
    case 'bald':
      if (!back) p(6, 2, 2, 1, tint(look.skin, 0.5));
      break;
    case 'wild':
      hairCap(p, h, view);
      p(5, 0, 1, 1, h);
      p(8, 0, 1, 1, h);
      if (!side) p(10, 0, 1, 1, h);
      p(3, 2, 1, 2, h);
      if (!side) p(12, 2, 1, 2, h);
      break;
    case 'bun':
      hairCap(p, h, view);
      if (back) {
        p(6, 2, 4, 3, shade(h, 0.1));
        p(10, 2, 1, 1, GOLD);
      } else if (side) {
        p(3, 2, 2, 3, h);
        p(2, 2, 1, 1, GOLD);
      } else {
        p(7, 0, 2, 1, h);
        p(9, 1, 2, 1, GOLD);
      }
      break;
    case 'fur':
      if (back) hairCap(p, h, view);
      p(6, 0, 4, 1, hat);
      p(4, 1, 8, 1, hat);
      p(3, 2, 10, 1, hat);
      p(3, 3, 10, 1, tint(hat, 0.35));
      p(5, 1, 1, 1, shade(hat));
      p(9, 2, 1, 1, shade(hat));
      break;
    case 'long':
      hairCap(p, h, view);
      if (back) p(5, 8, 6, 3, h);
      else if (side) p(4, 8, 2, 3, h);
      else {
        p(4, 6, 1, 5, h);
        p(11, 6, 1, 5, h);
        p(10, 1, 1, 1, hat);
      }
      break;
    case 'cap':
      hairCap(p, h, view);
      p(6, 1, 4, 1, hat);
      p(5, 2, 6, 1, hat);
      p(4, 3, 8, 1, shade(hat));
      break;
  }
}

function drawWeapon(p: Px, look: Look, view: View) {
  const w = look.weapon;
  if (!w || w === 'none') return;
  if (view === 'back' && (w === 'fan' || w === 'bow')) {
    if (w === 'bow') {
      p(7, 3, 1, 1, WOOD);
      p(8, 4, 1, 5, WOOD);
      p(7, 9, 1, 1, WOOD);
    }
    return;
  }
  const x = view === 'side' ? 11 : 12;
  switch (w) {
    case 'sword':
      p(x, 6, 1, 5, STEEL);
      p(x, 9, 1, 2, STEEL_DARK);
      p(x - 1, 11, 3, 1, GOLD);
      p(x, 12, 1, 1, WOOD_DARK);
      break;
    case 'spear':
      p(x, 2, 1, 14, WOOD);
      p(x, 0, 1, 2, STEEL);
      p(x - 1, 2, 1, 1, '#d02020');
      p(x + 1, 2, 1, 1, '#d02020');
      break;
    case 'fork':
      p(x, 2, 1, 14, WOOD);
      p(x - 1, 2, 3, 1, STEEL_DARK);
      p(x - 1, 0, 1, 2, STEEL);
      p(x, 0, 1, 2, STEEL);
      p(x + 1, 0, 1, 2, STEEL);
      break;
    case 'staff':
      p(x, 1, 1, 15, WOOD);
      break;
    case 'hoe':
      p(x, 3, 1, 13, WOOD);
      p(x - 1, 2, 3, 1, STEEL_DARK);
      break;
    case 'cane':
      p(x - 1, 11, 1, 5, WOOD);
      p(x - 2, 11, 1, 1, WOOD);
      break;
    case 'fan':
      p(x, 8, 3, 3, '#f6f2e4');
      p(x, 8, 1, 1, '#c8c0a8');
      p(x, 11, 1, 1, WOOD);
      break;
    case 'axes':
      p(x, 8, 1, 5, WOOD_DARK);
      p(x + 1, 7, 2, 3, STEEL);
      p(x + 2, 7, 1, 3, STEEL_DARK);
      if (view === 'front') {
        p(3, 8, 1, 5, WOOD_DARK);
        p(1, 7, 2, 3, STEEL);
        p(1, 7, 1, 3, STEEL_DARK);
      }
      break;
    case 'bow':
      p(x + 1, 4, 1, 1, WOOD);
      p(x + 2, 5, 1, 5, WOOD);
      p(x + 1, 10, 1, 1, WOOD);
      p(x + 1, 5, 1, 5, '#e8e4d0');
      break;
  }
}

function paint(look: Look, facing: Facing, frame: number): HTMLCanvasElement {
  if (facing === 'left') return flipX(paint(look, 'right', frame));
  const view: View = facing === 'up' ? 'back' : facing === 'right' ? 'side' : 'front';
  const c = makeCanvas(16, 16);
  const ctx = ctx2d(c);
  const p: Px = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // 背面时武器在身后，先画
  if (view === 'back') drawWeapon(p, look, view);
  drawLegs(p, look, view, frame);
  drawBody(p, look, view, frame);
  drawHead(p, look, view);
  drawBeard(p, look, view);
  drawHair(p, look, view);
  if (view !== 'back') drawWeapon(p, look, view);
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

/** frame：0 站立，1、2 两个迈步动作。 */
export function charSprite(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `${facing}${frame}`, () => paint(look, facing, frame));
}

export function charSpriteGray(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `g${facing}${frame}`, () => grayscale(charSprite(look, facing, frame)));
}

export function charSpriteFlash(look: Look, facing: Facing = 'down', frame = 0) {
  return cached(look, `w${facing}${frame}`, () => silhouette(charSprite(look, facing, frame)));
}
