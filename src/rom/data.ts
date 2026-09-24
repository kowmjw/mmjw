// 原版 ROM 里的数据位置和读取工具（纯逻辑，不碰浏览器，测试里可以用合成数据）。
// 各个地址的来历见 docs/rom-notes.md。只核对过丁丁机的简体修改版（CRC32 EB8759C0）。

export const ADDR = {
  titleTiles: 0x09fe38,
  titleSky: 0x0dac96,
  titleLogo: 0x0dc4c2,
  titleStartOn: 0x027ca6,
  titleStartOff: 0x027d36,
  titleLoadOn: 0x027cee,
  titleLoadOff: 0x027d7e,
  titlePalette: 0x029344,
  mapLayout: 0x0293ea,
  mapBlocks: 0x0770a6,
  mapTiles: 0x032182,
  mapPalette: 0x0dd744,
  mapEntry: 0x0de088,
  mapNpcs: 0x0dc9d0,
  events: 0x0e2de2,
  messages: 0x0bc6e4,
  talk: 0x0deb4c,
  font: 0x0ae2a4,
  sprites: 0x100000,
  portraits: 0x160000,
  peoplePalette: 0x0175c8,
  windowTiles: 0x083674,
  newGameScript: 0x0e2ff0,
} as const;

/** 地图组数和每组的地图数（排版表里数出来的）。 */
export const MAP_GROUPS = [1, 8, 8, 10, 10, 10, 10, 10, 12, 9, 9, 11, 10];

export const SPRITE_COUNT = 79;
export const PORTRAIT_COUNT = 78;
export const FONT_BANKS = 8;
export const MESSAGE_COUNT = 510;

export class RomData {
  constructor(readonly b: Uint8Array) {}

  u8(a: number) {
    return this.b[a];
  }

  u16(a: number) {
    return (this.b[a] << 8) | this.b[a + 1];
  }

  s16(a: number) {
    const v = this.u16(a);
    return v & 0x8000 ? v - 0x10000 : v;
  }

  u32(a: number) {
    return ((this.b[a] << 24) | (this.b[a + 1] << 16) | (this.b[a + 2] << 8) | this.b[a + 3]) >>> 0;
  }

  /** 两级指针表：table[g] → 子表，子表[m] → 数据。 */
  ptr2(table: number, g: number, m: number) {
    return this.u32(this.u32(table + g * 4) + m * 4);
  }

  /** 从 a 开始的图块数据，到字 0x3402 为止（原版 $0E50 的规则）。 */
  tileBlock(a: number, max = 0x10000) {
    let end = a;
    while (end < this.b.length - 1 && end - a < max && this.u16(end) !== 0x3402) end += 2;
    return this.b.subarray(a, end);
  }
}

/** 是不是认得的这一版 ROM：几张关键指针表都要对得上。 */
export function isKnownRom(b: Uint8Array) {
  if (b.length < 0x200000) return false;
  const r = new RomData(b);
  return (
    r.u32(ADDR.sprites) === 0x100400 &&
    r.u32(ADDR.portraits) === 0x160138 &&
    r.u32(ADDR.mapLayout) === 0x2941e &&
    r.u32(ADDR.font) === 0xae2c4 &&
    r.u32(ADDR.messages) === 0xbcedc
  );
}
