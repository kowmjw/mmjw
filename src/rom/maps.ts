// 原版地图：排版（三段 RLE）、大块定义、图块、调色板、入口表、NPC 表。

import { ADDR, RomData } from './data';
import { blitTile, nameEntry, PixelBuf, readPalette } from './gfx';

/** 原版 $2DC6 的 RLE 解压，返回数据和下一段的起点。 */
export function unRle(b: Uint8Array, p: number): { data: Uint8Array; next: number } {
  const out: number[] = [];
  let pair = false;
  for (let guard = 0; guard < 0x20000; guard++) {
    const c = b[p++];
    if (c === 0xf0) {
      pair = false;
      continue;
    }
    if (c === 0xf1) {
      pair = true;
      continue;
    }
    if (c <= 0xef) {
      out.push(c);
      continue;
    }
    let n: number;
    if (c === 0xff) {
      n = b[p++];
      if (n === 0) return { data: Uint8Array.from(out), next: p };
    } else {
      n = c & 0x0f;
    }
    if (pair) {
      const x = b[p];
      const y = b[p + 1];
      p += 2;
      for (let i = 0; i < n; i++) out.push(x, y);
    } else {
      const x = b[p++];
      for (let i = 0; i < n; i++) out.push(x);
    }
  }
  throw new Error('地图数据损坏');
}

export interface MapEntry {
  width: number;
  height: number;
  camX: number;
  camY: number;
  x: number;
  y: number;
  facing: number;
}

/** 入口表：地图尺寸、镜头和主角的起始位置。编号高字节是组，低字节是组内序号。 */
export function mapEntry(rom: RomData, id: number): MapEntry {
  const a = rom.u32(ADDR.mapEntry + (id >> 8) * 4) + (id & 0xff) * 16;
  const s8 = (v: number) => (v & 0x80 ? v - 256 : v);
  return {
    width: rom.u8(a + 2),
    height: rom.u8(a + 1),
    camX: s8(rom.u8(a + 4)),
    camY: s8(rom.u8(a + 5)),
    x: rom.u16(a + 6),
    y: rom.u16(a + 8),
    facing: rom.u8(a + 10),
  };
}

export interface NpcRecord {
  sprite: number;
  anim: number;
  x: number;
  y: number;
  /** 0xFF 站着不动，其它值是走动方式 */
  mode: number;
  talk: number;
  /** 走动范围（像素）：x1 y1 x2 y2 */
  box: [number, number, number, number];
}

/** 地图上的 NPC（原版 $18198）。visible 是可见位图，第 i 位对应第 i 个 NPC。 */
export function mapNpcs(rom: RomData, map: number, visible = 0xffff): NpcRecord[] {
  let a = rom.ptr2(ADDR.mapNpcs, map >> 8, map & 0xff);
  const out: NpcRecord[] = [];
  for (let i = 0; i < 16 && rom.u8(a) !== 0; i++, a += 16) {
    if (!((visible >> i) & 1)) continue;
    out.push({
      sprite: rom.u8(a),
      anim: rom.u8(a + 1),
      x: rom.u16(a + 2),
      y: rom.u16(a + 4),
      mode: rom.u8(a + 6),
      talk: rom.u8(a + 7),
      box: [rom.u16(a + 8), rom.u16(a + 10), rom.u16(a + 12), rom.u16(a + 14)],
    });
  }
  return out;
}

/** 这些地图的 NPC 可见位图存在 RAM $FFE2C0 起（脚本会改），其它地图全部可见。 */
export const NPC_MASK_MAPS = [0x0103, 0x0204, 0x0404, 0x0305, 0x0400, 0x0405, 0x0407, 0x0502, 0x0602, 0x0501, 0x0604, 0x0804, 0x0902, 0x0903, 0x0a03];

export interface MapData {
  id: number;
  width: number;
  height: number;
  ground: Uint8Array;
  attr: Uint8Array;
  blocks: number;
  tiles: Uint8Array;
  palette: Uint32Array;
}

export function loadMap(rom: RomData, id: number, width: number): MapData {
  const g = id >> 8;
  const m = id & 0xff;
  let p = rom.ptr2(ADDR.mapLayout, g, m);
  const upper = unRle(rom.b, p);
  p = upper.next;
  const ground = unRle(rom.b, p);
  p = ground.next;
  const attr = unRle(rom.b, p);
  const height = Math.ceil(ground.data.length / width);
  const palette = new Uint32Array(64);
  palette.set(readPalette(rom, rom.ptr2(ADDR.mapPalette, g, m), 32));
  return {
    id,
    width,
    height,
    ground: ground.data,
    attr: attr.data,
    blocks: rom.ptr2(ADDR.mapBlocks, g, m),
    tiles: rom.tileBlock(rom.ptr2(ADDR.mapTiles, g, m)),
    palette,
  };
}

/**
 * 画一个 32×32 的大块。图块从显存 0x200 号开始，所以版面里的图块号要减 0x200。
 * 返回有没有高优先级的部分（原版里会盖在人物上面，比如屋檐）。
 */
export function drawBlock(rom: RomData, map: MapData, block: number, buf: PixelBuf, x: number, y: number, layer: 'low' | 'high' | 'all' = 'all') {
  let hasHigh = false;
  for (let j = 0; j < 16; j++) {
    const e = nameEntry(rom.u16(map.blocks + block * 32 + j * 2));
    if (e.pri) hasHigh = true;
    if (layer === 'low' && e.pri) continue;
    if (layer === 'high' && !e.pri) continue;
    const t = e.tile - 0x200;
    if (t < 0 || t * 32 + 32 > map.tiles.length) continue;
    blitTile(buf, map.tiles, t * 32, x + (j & 3) * 8, y + (j >> 2) * 8, map.palette, e.line & 1, e.hflip, e.vflip, layer === 'high');
  }
  return hasHigh;
}

/** 整张地图画成两张图：底层（全部格子）和高优先级层（盖在人物上面的部分，透明底）。 */
export function renderMap(rom: RomData, map: MapData) {
  const low = new PixelBuf(map.width * 32, map.height * 32);
  const high = new PixelBuf(map.width * 32, map.height * 32);
  let anyHigh = false;
  for (let i = 0; i < map.width * map.height; i++) {
    const bx = (i % map.width) * 32;
    const by = Math.floor(i / map.width) * 32;
    const block = map.ground[i] ?? 0;
    drawBlock(rom, map, block, low, bx, by, 'all');
    // 高优先级的部分再画一次到上层；底层也保留完整画面
    const e = drawBlock(rom, map, block, high, bx, by, 'high');
    anyHigh ||= e;
  }
  return { low, high: anyHigh ? high : null };
}
