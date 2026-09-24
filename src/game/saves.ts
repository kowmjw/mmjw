import { SLOT_COUNT, saveSlot, slotMeta } from '../engine/storage';
import { formatTime, type GameState } from './state';

export function slotLabel(slot: number) {
  return slot === 0 ? '自动存档' : `存档 ${slot}`;
}

/** 存档位列表（给菜单用）。onlyUsed 为真时空位不能选。base：原版模式的存档从 ORIG_SLOT_BASE 开始。 */
export function slotItems(from = 0, onlyUsed = true, base = 0) {
  const items = [];
  for (let i = from; i < SLOT_COUNT; i++) {
    const m = slotMeta(base + i);
    items.push({ label: slotLabel(i), right: m ? `${m.place} ${formatTime(m.playTime)}` : '（空）', enabled: onlyUsed ? !!m : true });
  }
  return items;
}

export function saveGame(slot: number, state: GameState, place: string) {
  return saveSlot(slot, { chapter: state.chapter, place, playTime: state.time }, state);
}
