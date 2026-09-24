// 战斗公式。都是暂定值，结构上方便以后换成从原版 ROM 读出来的数据。
import { CLASSES, FAMILIES, PROMO_BONUS, type ClassDef, type ClassId, type Family, type RangeShape, type Stats } from '../data/classes';
import type { TerrainInfo } from '../data/terrain';
import type { Rng } from '../engine/rng';

export interface Fighter extends Stats {
  cls: ClassId;
  level: number;
  maxHp: number;
  exp: number;
  boss?: boolean;
}

export const STRONG_MULT = 1.5;

/** 职业相克：攻击方系别 → 被克制的系别。 */
const STRONG: Partial<Record<Family, readonly Family[]>> = {
  spear: ['fisher', 'strategist', 'hermit', 'geomancer', 'healer'], // 攻略：枪客克渔人、卧龙、隐士、真人、医生
  assassin: ['spear', 'gunner', 'archer'], // 攻略：刺客克枪客、炮手、弓手
  blade: ['boxer', 'archer'], // 暂定
  boxer: ['spear'], // 暂定
  fisher: ['blade'], // 暂定
  archer: ['kite'], // 暂定
};

export function counterMult(att: ClassDef, def: ClassDef) {
  let m = STRONG[att.family]?.includes(def.family) ? STRONG_MULT : 1;
  if (att.id === 'wolong' && def.id !== 'wolong') m = Math.max(m, 1.3); // 攻略：卧龙打卧龙以外的职业都有不错的伤害
  if (att.id === 'qigongshi') m = Math.max(m, 1.2); // 攻略：气功师打什么职业都行
  return m;
}

export interface StrikeCalc {
  /** 不含浮动的基础伤害 */
  dmg: number;
  /** 命中率（%） */
  hit: number;
  /** 会心率（%） */
  crit: number;
  mult: number;
  /** 被渔人抵抗了一半法术伤害 */
  resisted: boolean;
  magic: boolean;
}

export function calcStrike(att: Fighter, def: Fighter, terrain: TerrainInfo): StrikeCalc {
  const ac = CLASSES[att.cls];
  const dc = CLASSES[def.cls];
  const mult = counterMult(ac, dc);
  const magic = !!ac.magic;
  let dmg = att.atk * mult - def.def * (magic ? 0.25 : 0.5) * (1 + terrain.def);
  const resisted = magic && dc.family === 'fisher'; // 攻略：渔人能抵抗法术系攻击
  if (resisted) dmg *= 0.5;
  const hit = Math.max(10, Math.min(100, Math.round(att.hit - def.eva - terrain.eva + (magic ? 5 : 0))));
  const crit = ac.family === 'assassin' ? 15 : 5;
  return { dmg: Math.max(1, Math.round(dmg)), hit, crit, mult, resisted, magic };
}

export function rollStrike(c: StrikeCalc, rng: Rng) {
  const hit = rng() * 100 < c.hit;
  const crit = hit && rng() * 100 < c.crit;
  const vary = 0.9 + rng() * 0.2;
  const dmg = hit ? Math.max(1, Math.round(c.dmg * vary * (crit ? 1.5 : 1))) : 0;
  return { hit, crit, dmg };
}

export function inRange(shape: RangeShape, dx: number, dy: number) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let d: number;
  switch (shape.kind) {
    case 'cross':
      if (ax !== 0 && ay !== 0) return false;
      d = ax + ay;
      break;
    case 'diamond':
      d = ax + ay;
      break;
    case 'square':
      d = Math.max(ax, ay);
      break;
  }
  return d >= shape.min && d <= shape.max;
}

export function expForAttack(att: Fighter, def: Fighter, hit: boolean, killed: boolean) {
  if (!hit) return 1;
  let e = Math.max(2, Math.min(30, 10 + (def.level - att.level) * 3));
  if (killed) e += 20 + def.level * 2 + (def.boss ? 30 : 0);
  return Math.min(e, 99);
}

export const HEAL_EXP = 12;

export function healAmount(healer: Fighter) {
  return 20 + healer.level * 2 + (CLASSES[healer.cls].tier - 1) * 10;
}

export interface LevelUp {
  level: number;
  gains: Stats;
  promotedTo?: ClassId;
}

export const MAX_LEVEL = 50;

/** 加经验，满 100 升一级；到转职等级自动转职。会直接改 u 的属性。 */
export function gainExp(u: Fighter & { hp: number }, amount: number, rng: Rng): LevelUp[] {
  const ups: LevelUp[] = [];
  if (u.level >= MAX_LEVEL) return ups;
  u.exp += amount;
  while (u.exp >= 100 && u.level < MAX_LEVEL) {
    u.exp -= 100;
    u.level++;
    const cls = CLASSES[u.cls];
    const growth = FAMILIES[cls.family].growth;
    const gains = { hp: 0, atk: 0, def: 0, hit: 0, eva: 0 };
    for (const k of Object.keys(gains) as (keyof Stats)[]) {
      const g = growth[k];
      gains[k] = Math.floor(g) + (rng() < g - Math.floor(g) ? 1 : 0);
    }
    const up: LevelUp = { level: u.level, gains };
    if (cls.promote && u.level >= cls.promote.level) {
      const next = CLASSES[cls.promote.to];
      const bonus = PROMO_BONUS[next.tier as 2 | 3];
      for (const k of Object.keys(gains) as (keyof Stats)[]) gains[k] += bonus[k];
      u.cls = next.id;
      up.promotedTo = next.id;
    }
    u.maxHp += gains.hp;
    u.hp += gains.hp;
    u.atk += gains.atk;
    u.def += gains.def;
    u.hit += gains.hit;
    u.eva += gains.eva;
    ups.push(up);
  }
  if (u.level >= MAX_LEVEL) u.exp = 0;
  return ups;
}
