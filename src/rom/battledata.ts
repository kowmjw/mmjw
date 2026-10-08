// 原版战斗用的数据表，全部在运行时从 ROM 读（不把数值抄进仓库）。
// 地址和含义见 docs/rom-notes.md「战斗规则」一节。

import { RomData } from './data';

export const BATTLE_ADDR = {
  /** 道具表：(道具号-1)×8 字节 [威力, 次数, 连击, 0, 0, 10, 命中, 效果] */
  items: 0x28e54,
  /** 装备许可：道具号×4 的 32 位掩码，第 (职业-1) 位为 1 表示能装 */
  equipMask: 0x1a130,
  /** 15 个能力成长表的指针（按能力类别 +21），每表 8 项 [基础, 分子, 分母, 上限] */
  curves: 0x14daa,
  /** 职业 1–30 的移动力 */
  move: 0x14d8c,
  /** 职业 1–30 能走的地形上限（属性值小于它才能走） */
  passLimit: 0x6c68,
  /** 职业 1–30 攻击范围的指针，每项 (dx 字, dy 字)，0x12345678 结束 */
  ranges: 0xaeb2,
  /** 转职表：按能力类别的指针，[职业, 等级, 新职业, 等级, 新职业, …, 0x64] */
  promotions: 0x5f24,
  /** 相克表：15×15，攻方类别×15+守方类别，单位 1/10，0 表示不加成 */
  counter: 0x611e,
  /** 经验：命中（或辅助成功）表、击倒表，各 14 项 */
  expHit: 0x5f08,
  expKill: 0x5f16,
} as const;

/** 道具效果（道具表第 7 字节）。饰品的这一字节是加成的能力。 */
export const EFFECT = {
  physical: 0,
  magic: 1,
  heal: 2,
  confuse: 3,
  poison: 4,
  weaken: 5,
  armorBreak: 6,
  cure: 13,
  areaHeal: 14,
  revive: 15,
} as const;

export interface ItemDef {
  id: number;
  power: number;
  /** 次数；99 是基本武器，用不完 */
  uses: number;
  /** 一次攻击打几下 */
  hits: number;
  hit: number;
  effect: number;
}

export interface Curve {
  base: number;
  num: number;
  den: number;
  cap: number;
}

export interface BattleTables {
  item(id: number): ItemDef | null;
  canEquip(item: number, cls: number): boolean;
  /** 能力类别 0–14 的 8 条成长曲线：最大 HP、攻击、法力、防御、法防、必杀、命中、回避 */
  curves: Curve[][];
  move: number[];
  passLimit: number[];
  ranges: [number, number][][];
  promotions: number[][];
  counter: number[];
  expHit: number[];
  expKill: number[];
}

/** 道具号的大类：武器（含书、咒、医书）、饰品、消耗品。 */
export function itemKind(id: number): 'weapon' | 'accessory' | 'consumable' | 'none' {
  if (id <= 0) return 'none';
  if (id < 0x70) return 'weapon';
  if (id < 0x80) return 'accessory';
  if (id < 0x90) return 'consumable';
  return 'none';
}

export function readBattleTables(rom: RomData): BattleTables {
  const A = BATTLE_ADDR;
  const items = new Map<number, ItemDef>();
  const item = (id: number): ItemDef | null => {
    if (id <= 0 || id >= 0x90) return null;
    let d = items.get(id);
    if (!d) {
      const a = A.items + (id - 1) * 8;
      d = { id, power: rom.u8(a), uses: rom.u8(a + 1), hits: Math.max(1, rom.u8(a + 2)), hit: rom.u8(a + 6), effect: rom.u8(a + 7) };
      items.set(id, d);
    }
    return d;
  };
  const curves: Curve[][] = [];
  for (let k = 0; k < 15; k++) {
    const p = rom.u32(A.curves + k * 4);
    const list: Curve[] = [];
    for (let s = 0; s < 8; s++) {
      const q = p + s * 4;
      list.push({ base: rom.u8(q), num: rom.u8(q + 1), den: Math.max(1, rom.u8(q + 2)), cap: rom.u8(q + 3) });
    }
    curves.push(list);
  }
  const move = [0];
  const passLimit = [0];
  const ranges: [number, number][][] = [[]];
  for (let c = 1; c <= 30; c++) {
    move.push(rom.u8(A.move + c - 1));
    passLimit.push(rom.u8(A.passLimit + c - 1));
    const list: [number, number][] = [];
    let q = rom.u32(A.ranges + (c - 1) * 4);
    for (let guard = 0; guard < 64 && rom.u32(q) !== 0x12345678; guard++, q += 4) list.push([rom.s16(q), rom.s16(q + 2)]);
    ranges.push(list);
  }
  const promotions: number[][] = [];
  for (let k = 0; k < 15; k++) {
    const p = rom.u32(A.promotions + k * 4);
    const list: number[] = [];
    for (let i = 0; i < 12; i++) {
      const v = rom.u8(p + i);
      list.push(v);
      if (i > 0 && i % 2 === 1 && v === 0x64) break;
    }
    promotions.push(list);
  }
  const counter: number[] = [];
  for (let i = 0; i < 225; i++) counter.push(rom.u8(A.counter + i));
  const bytes = (a: number, n: number) => Array.from({ length: n }, (_, i) => rom.u8(a + i));
  return {
    item,
    canEquip: (id, cls) => cls >= 1 && cls <= 30 && id > 0 && id < 0x90 && ((rom.u32(A.equipMask + id * 4) >>> (cls - 1)) & 1) === 1,
    curves,
    move,
    passLimit,
    ranges,
    promotions,
    counter,
    expHit: bytes(A.expHit, 14),
    expKill: bytes(A.expKill, 14),
  };
}
