// 原版战斗数据（还在分析，先放已经确定的部分）。
// 战斗编号由脚本 op32 设置（$FFE10F），新游戏时是 0。

import { RomData } from './data';

/** 每场战斗的胜负判定代码表（$120E8，36 场）。 */
const CONDITIONS = 0x120e8;
const FIRE_EVENT = 0x14144;
export const BATTLE_COUNT = 36;

/**
 * 某场战斗的判定代码里会触发的事件号，按出现顺序。第一个是失败（0x44），
 * 第二个通常是开场，最后一个通常是胜利。
 */
export function battleEventCodes(rom: RomData, battle: number): number[] {
  if (battle < 0 || battle >= BATTLE_COUNT) return [];
  const start = rom.u32(CONDITIONS + battle * 4);
  const end = battle + 1 < BATTLE_COUNT ? rom.u32(CONDITIONS + (battle + 1) * 4) : FIRE_EVENT;
  const out: number[] = [];
  for (let p = start; p + 10 <= end; p += 2) {
    // move.b #xx,d2 ; jsr $14144
    if (rom.u16(p) === 0x143c && rom.u16(p + 4) === 0x4eb9 && rom.u32(p + 6) === FIRE_EVENT) out.push(rom.u8(p + 3));
  }
  return out;
}

/** 占位用：打赢后接着跑的事件（判定代码里最后一个事件）。 */
export function victoryEvent(rom: RomData, battle: number): number | null {
  const codes = battleEventCodes(rom, battle);
  return codes.length >= 2 ? codes[codes.length - 1] : null;
}
