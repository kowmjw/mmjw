// 从 ROM 做出游戏里要用的画面（浏览器画布），按需生成并缓存。

import { makeCanvas } from '../engine/pixel';
import { ADDR, PORTRAIT_COUNT, RomData, SPRITE_COUNT } from './data';
import { blitColumnMajor, blitTile, glyphBits, peoplePalette, PixelBuf, readPalette, Vram } from './gfx';
import { loadMap, renderMap, type MapData } from './maps';

export function bufToCanvas(buf: PixelBuf) {
  const c = makeCanvas(buf.w, buf.h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(buf.w, buf.h);
  new Uint32Array(img.data.buffer).set(buf.px);
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface TitleArt {
  /** A 层：天空到山景，320×512，标题时从 288 像素处开始显示 */
  sky: HTMLCanvasElement;
  /** B 层「水滸傳」，透明底，320×80（放在 y=24） */
  logo: HTMLCanvasElement;
  /** 菜单两项，各有选中/未选中，96×24 */
  start: [HTMLCanvasElement, HTMLCanvasElement];
  load: [HTMLCanvasElement, HTMLCanvasElement];
}

export interface OrigMap {
  data: MapData;
  low: HTMLCanvasElement;
  high: HTMLCanvasElement | null;
}

/** 每个人物 14 帧：0–10 是原图，11–13 是 6–8 的左右镜像（朝右走）。 */
export const SPRITE_FRAMES = 14;

export class RomAssets {
  readonly rom: RomData;
  readonly people: Uint32Array;
  private sprites = new Map<number, HTMLCanvasElement>();
  private portraits = new Map<number, HTMLCanvasElement>();
  private glyphs = new Map<string, HTMLCanvasElement>();
  private maps = new Map<number, OrigMap>();
  private title: TitleArt | null = null;
  private windowArt: HTMLCanvasElement | null = null;

  constructor(bytes: Uint8Array) {
    this.rom = new RomData(bytes);
    this.people = peoplePalette(this.rom);
  }

  titleArt(): TitleArt {
    if (this.title) return this.title;
    const rom = this.rom;
    const vram = new Vram();
    vram.load(rom.tileBlock(ADDR.titleTiles), 1);
    const pal = readPalette(rom, ADDR.titlePalette, 64);
    const sky = new PixelBuf(320, 512);
    vram.drawNames(sky, rom, ADDR.titleSky, 40, 64, 0, 0, pal);
    const logo = new PixelBuf(31 * 8, 10 * 8);
    vram.drawNames(logo, rom, ADDR.titleLogo, 31, 10, 0, 0, pal, { transparent: true, skipZero: true });
    const item = (a: number) => {
      const b = new PixelBuf(12 * 8, 3 * 8);
      vram.drawNames(b, rom, a, 12, 3, 0, 0, pal, { transparent: true, skipZero: true });
      return bufToCanvas(b);
    };
    this.title = {
      sky: bufToCanvas(sky),
      logo: bufToCanvas(logo),
      start: [item(ADDR.titleStartOff), item(ADDR.titleStartOn)],
      load: [item(ADDR.titleLoadOff), item(ADDR.titleLoadOn)],
    };
    return this.title;
  }

  /** 人物行走图：一行 14 帧，每帧 32×32。 */
  spriteSheet(id: number) {
    const key = Math.max(0, Math.min(SPRITE_COUNT - 1, id));
    let c = this.sprites.get(key);
    if (c) return c;
    const base = this.rom.u32(ADDR.sprites + key * 4);
    const buf = new PixelBuf(32 * SPRITE_FRAMES, 32);
    for (let f = 0; f < 11; f++) blitColumnMajor(buf, this.rom.b, base + f * 512, 4, 4, f * 32, 0, this.people);
    for (let f = 0; f < 3; f++) blitColumnMajor(buf, this.rom.b, base + (6 + f) * 512, 4, 4, (11 + f) * 32, 0, this.people, true);
    c = bufToCanvas(buf);
    this.sprites.set(key, c);
    return c;
  }

  /** 头像号（消息里的写法）：0 没有，n 是头像表第 n-1 张。 */
  portrait(n: number) {
    if (n <= 0 || n > PORTRAIT_COUNT) return null;
    let c = this.portraits.get(n);
    if (c) return c;
    const a = this.rom.u32(ADDR.portraits + (n - 1) * 4);
    const buf = new PixelBuf(48, 48);
    blitColumnMajor(buf, this.rom.b, a, 6, 6, 0, 0, this.people);
    c = bufToCanvas(buf);
    this.portraits.set(n, c);
    return c;
  }

  /** 一页字库做成 16 列 × 15 行的字图（透明底），color 是 0xAABBGGRR。 */
  glyphAtlas(bank: number, color: number) {
    const key = `${bank}:${color}`;
    let c = this.glyphs.get(key);
    if (c) return c;
    const buf = new PixelBuf(16 * 16, 15 * 16);
    for (let code = 0; code < 240; code++) {
      const bits = glyphBits(this.rom, bank, code);
      const ox = (code % 16) * 16;
      const oy = Math.floor(code / 16) * 16;
      for (let i = 0; i < 256; i++) if (bits[i]) buf.px[(oy + (i >> 4)) * buf.w + ox + (i & 15)] = color;
    }
    c = bufToCanvas(buf);
    this.glyphs.set(key, c);
    return c;
  }

  /** 对话框的 8 个图块（边角、边、翻页箭头），用人物调色板画好，排成一行 64×8。 */
  windowTiles() {
    if (this.windowArt) return this.windowArt;
    const buf = new PixelBuf(64, 8);
    for (let t = 0; t < 8; t++) blitTile(buf, this.rom.b, ADDR.windowTiles + t * 32, t * 8, 0, this.people, 0, false, false, true);
    this.windowArt = bufToCanvas(buf);
    return this.windowArt;
  }

  map(id: number, width: number): OrigMap {
    const key = id * 256 + width;
    let m = this.maps.get(key);
    if (m) return m;
    const data = loadMap(this.rom, id, width);
    const r = renderMap(this.rom, data);
    m = { data, low: bufToCanvas(r.low), high: r.high ? bufToCanvas(r.high) : null };
    // 地图画布很大，只留最近用过的几张
    if (this.maps.size > 6) this.maps.delete(this.maps.keys().next().value!);
    this.maps.set(key, m);
    return m;
  }

  /** 人物调色板里的颜色（0xAABBGGRR），对话框文字用。 */
  peopleColor(i: number) {
    return this.people[i];
  }
}

/** 0xAABBGGRR → CSS 颜色。 */
export function cssColor(c: number) {
  return `rgb(${c & 255},${(c >> 8) & 255},${(c >> 16) & 255})`;
}
