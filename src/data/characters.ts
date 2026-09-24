import type { Look } from '../art/characters';
import type { ClassId } from './classes';

export interface CharDef {
  id: string;
  name: string;
  /** 绰号 */
  title?: string;
  cls: ClassId;
  level: number;
  look: Look;
}

const SKIN = '#f0c090';
const BLACK_HAIR = '#201810';

// 人物职业是按原著形象暂定的，原版里的职业以后从 ROM 核对。
const LIST: CharDef[] = [
  {
    id: 'chaogai',
    name: '晁盖',
    title: '托塔天王',
    cls: 'daoke',
    level: 4,
    look: { skin: SKIN, hair: BLACK_HAIR, style: 'topknot', hat: '#c03030', beard: BLACK_HAIR, cloth: '#b83a2a', trim: '#f0d890', belt: '#402010', pants: '#5a3a2a', weapon: 'sword', brow: 'fierce', beardStyle: 'full' },
  },
  {
    id: 'wuyong',
    name: '吴用',
    title: '智多星',
    cls: 'ceshi',
    level: 3,
    look: { skin: '#f4c8a0', hair: BLACK_HAIR, style: 'scholar', hat: '#2a3a6a', beard: BLACK_HAIR, cloth: '#4a6ab8', trim: '#e8e8f0', belt: '#e8e8f0', pants: '#3a4a7a', robe: true, weapon: 'fan', eyes: 'narrow', brow: 'raised', beardStyle: 'goatee', mouth: 'smile' },
  },
  {
    id: 'liutang',
    name: '刘唐',
    title: '赤发鬼',
    cls: 'quanshi',
    level: 3,
    look: { skin: '#d89868', hair: '#d83a1a', style: 'wild', cloth: '#6a4a2a', trim: '#d89868', belt: '#2a1a10', pants: '#3a2a1a', brow: 'fierce', mark: '#c83a2a', mouth: 'open' },
  },
  {
    id: 'shijin',
    name: '史进',
    title: '九纹龙',
    cls: 'qiangshushi',
    level: 4,
    look: { skin: SKIN, hair: BLACK_HAIR, style: 'band', hat: '#2a8a4a', cloth: '#ece4cc', trim: '#f0c090', belt: '#2a8a4a', pants: '#3a3a4a', tattoo: '#3a6ad8', weapon: 'spear', mouth: 'smile' },
  },
  {
    id: 'likui',
    name: '李逵',
    title: '黑旋风',
    cls: 'daoke',
    level: 4,
    look: { skin: '#8a5a3a', hair: '#101010', style: 'wild', beard: '#101010', cloth: '#2a2a2a', trim: '#8a5a3a', belt: '#a02020', pants: '#3a2a1a', weapon: 'axes', eyes: 'round', brow: 'fierce', beardStyle: 'full', mouth: 'open' },
  },
  // 敌兵
  {
    id: 'bandit_blade',
    name: '喽啰',
    cls: 'daoke',
    level: 2,
    look: { skin: '#e8b888', hair: '#302018', style: 'band', hat: '#7a2a2a', cloth: '#6a6a5a', trim: '#8a8a78', belt: '#3a2a1a', pants: '#4a4a3a', weapon: 'sword' },
  },
  {
    id: 'bandit_boxer',
    name: '喽啰',
    cls: 'quanshi',
    level: 2,
    look: { skin: '#e0a878', hair: '#302018', style: 'bald', cloth: '#c87a2a', trim: '#e0a878', belt: '#3a2a1a', pants: '#5a3a1a' },
  },
  {
    id: 'bandit_fisher',
    name: '喽啰',
    cls: 'yuren',
    level: 2,
    look: { skin: '#d8a070', hair: '#302018', style: 'straw', hat: '#d8c070', cloth: '#4a7a9a', trim: '#d8a070', pants: '#4a7a9a', weapon: 'fork' },
  },
];

export const CHARS: Record<string, CharDef> = Object.fromEntries(LIST.map((c) => [c.id, c]));

// 只在探索地图上出现的村民（没有战斗属性）
export const NPC_LOOKS: Record<string, Look> = {
  villager: { skin: SKIN, hair: BLACK_HAIR, style: 'cap', hat: '#6a5a3a', cloth: '#8a6a4a', belt: '#4a3a2a', pants: '#5a4a3a' },
  farmer: { skin: '#e0a878', hair: BLACK_HAIR, style: 'straw', hat: '#d8c070', cloth: '#7a8a5a', trim: '#e0a878', pants: '#5a5a3a', weapon: 'hoe' },
  child: { skin: '#f8d0a8', hair: BLACK_HAIR, style: 'topknot', cloth: '#d86a6a', pants: '#8a4a4a', eyes: 'round', mouth: 'smile' },
  granny: { skin: '#f0c8a0', hair: '#e8e8e8', style: 'bun', cloth: '#6a5a7a', trim: '#b8a8c8', robe: true, weapon: 'cane', eyes: 'old', mouth: 'smile' },
  hunter: { skin: '#e0a878', hair: BLACK_HAIR, style: 'fur', hat: '#8a6a3a', beard: '#3a2a1a', cloth: '#5a6a3a', belt: '#3a2a1a', pants: '#4a3a2a', weapon: 'bow', beardStyle: 'short' },
  servant: { skin: SKIN, hair: BLACK_HAIR, style: 'cap', hat: '#3a3a5a', cloth: '#4a4a6a', belt: '#2a2a3a', pants: '#3a3a4a', weapon: 'staff' },
  fisherman: { skin: '#d8a070', hair: '#302018', style: 'straw', hat: '#e0cc88', cloth: '#6a8aa8', trim: '#d8a070', pants: '#6a8aa8' },
  woman: { skin: '#f8d0b0', hair: BLACK_HAIR, style: 'long', hat: '#d04060', cloth: '#c86a8a', trim: '#f0d0e0', robe: true },
  girl: { skin: '#f8d0b0', hair: BLACK_HAIR, style: 'long', hat: '#f0a020', cloth: '#e08aa8', robe: true, eyes: 'round', mouth: 'smile' },
};

export function lookOf(id: string): Look {
  return CHARS[id]?.look ?? NPC_LOOKS[id] ?? NPC_LOOKS.villager;
}
