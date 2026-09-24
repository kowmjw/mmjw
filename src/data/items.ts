import type { Stats } from './classes';

export type ItemId = 'shangyao' | 'pijuancao' | 'gongshuzhinan' | 'mafeicao';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** use：消耗品；equip：饰品；key：剧情道具 */
  kind: 'use' | 'equip' | 'key';
  desc: string;
  heal?: number;
  bonus?: Partial<Stats>;
}

// 名字来自攻略资料；效果数值除「弓术指南 命中+10%」外都是暂定。
export const ITEMS: Record<ItemId, ItemDef> = {
  shangyao: { id: 'shangyao', name: '伤药', kind: 'use', desc: '恢复 40 点体力。', heal: 40 },
  pijuancao: { id: 'pijuancao', name: '疲倦草', kind: 'use', desc: '提神的草药，恢复 20 点体力。', heal: 20 },
  gongshuzhinan: { id: 'gongshuzhinan', name: '弓术指南', kind: 'equip', desc: '饰品。命中 +10%。', bonus: { hit: 10 } },
  mafeicao: { id: 'mafeicao', name: '麻沸草', kind: 'key', desc: '能让人昏睡的草药。' },
};

export type Inventory = Partial<Record<ItemId, number>>;

export function countItem(inv: Inventory, id: ItemId) {
  return inv[id] ?? 0;
}

export function addItem(inv: Inventory, id: ItemId, n = 1) {
  inv[id] = countItem(inv, id) + n;
}

export function takeItem(inv: Inventory, id: ItemId, n = 1): boolean {
  const have = countItem(inv, id);
  if (have < n) return false;
  if (have === n) delete inv[id];
  else inv[id] = have - n;
  return true;
}
