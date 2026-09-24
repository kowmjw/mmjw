import type { Facing } from '../art/characters';
import { CHARS } from '../data/characters';
import { statsAt, type ClassId, type Stats } from '../data/classes';
import type { Inventory, ItemId } from '../data/items';

/** 队伍里的一个人（属性不含饰品加成；体力战后回满，所以不存当前体力）。 */
export interface Member extends Stats {
  id: string;
  cls: ClassId;
  level: number;
  exp: number;
  accessory: ItemId | null;
}

export interface GameState {
  v: 1;
  party: Member[];
  inv: Inventory;
  flags: Record<string, number>;
  map: string;
  x: number;
  y: number;
  dir: Facing;
  /** 游戏时间（秒） */
  time: number;
  chapter: string;
}

export function makeMember(id: string, level?: number): Member {
  const c = CHARS[id];
  if (!c) throw new Error(`没有这个人物：${id}`);
  const lv = level ?? c.level;
  return { id, cls: c.cls, level: lv, exp: 0, accessory: null, ...statsAt(c.cls, lv) };
}

export function newGame(): GameState {
  return {
    v: 1,
    party: [makeMember('chaogai'), makeMember('wuyong'), makeMember('liutang')],
    inv: { shangyao: 3 },
    flags: {},
    map: 'shijiacun',
    x: 13,
    y: 18,
    dir: 'up',
    time: 0,
    chapter: '第一章 史家村',
  };
}

export function flag(s: GameState, key: string) {
  return s.flags[key] ?? 0;
}

export function setFlag(s: GameState, key: string, value = 1) {
  s.flags[key] = value;
}

export function inParty(s: GameState, id: string) {
  return s.party.some((m) => m.id === id);
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
