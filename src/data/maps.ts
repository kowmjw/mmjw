import type { Facing } from '../art/characters';
import type { ItemId } from './items';

export interface NpcDef {
  id: string;
  look: string;
  x: number;
  y: number;
  dir?: Facing;
  /** 对话事件名（见 story/chapter1.ts） */
  talk: string;
  /** 这个旗标为真时不出现 */
  hideIf?: string;
}

/** 可以调查的东西（柜子、罐子、水井……）。 */
export interface ObjDef {
  x: number;
  y: number;
  item?: ItemId;
  count?: number;
  /** 拿过东西后记下的旗标 */
  flag?: string;
  /** 调查时的说明文字（没有东西可拿时显示） */
  text?: string;
}

export interface WarpDef {
  x: number;
  y: number;
  to: string;
  tx: number;
  ty: number;
  dir: Facing;
}

export interface TriggerDef {
  x: number;
  y: number;
  w?: number;
  h?: number;
  event: string;
}

export interface FieldMapDef {
  id: string;
  name: string;
  rows: string[];
  npcs: NpcDef[];
  objects: ObjDef[];
  warps: WarpDef[];
  triggers: TriggerDef[];
  onEnter?: string;
}

// 史家村：攻略提到「村子左上角房屋里有弓术指南，右下角房屋里有伤药」，这里照着放。
// 其余布局是自己设计的临时地图，拿到原版 ROM 后替换。
const SHIJIACUN: FieldMapDef = {
  id: 'shijiacun',
  name: '史家村',
  rows: [
    'TTTTTTTTTTTTTTTTTTTTTT~~TTTT',
    'T.......wwwwwwwwwwww..~~..TT',
    'T.RRRR..wcRRRRRRRRcw..~~...T',
    'T.RRRR..wcRRRRRRRRcw..~~.f.T',
    'T.WDWW..wcWWWddWWWcw..~~...T',
    'T..,....wccccccccccw..~~...T',
    'T..,....wccccccccccw..~~...T',
    'T..,....wccccccccccw..~~...T',
    'T..,....wwwwwGGwwwww..~~...T',
    'T..,.........,,..RRRR.~~...T',
    'T..,..FFFF...,,..RRRR.~~...T',
    'T..,..FFFF.h.,,..WDWW.~~...T',
    'T..,,,,,,,,,,,,,,,,,,,==,,.T',
    'T..h..FFFF.L.,,.....f.~~...T',
    'T..RRRR......,,..RRRR.~~...T',
    'T..RRRR......,,..RRRR.~~...T',
    'T..WDWW......,,..WDWW.~~...T',
    'T...,,,,,,,,,,,,,,,...~~...T',
    'T............,,.......~~...T',
    'TTTTTTTTTTTTT,,TTTTTTT~~TTTT',
  ],
  npcs: [
    { id: 'shijin', look: 'shijin', x: 14, y: 6, dir: 'down', talk: 'shijin', hideIf: 'shijin_joined' },
    { id: 'servant', look: 'servant', x: 10, y: 6, dir: 'down', talk: 'servant' },
    { id: 'villager', look: 'villager', x: 11, y: 18, dir: 'right', talk: 'villager' },
    { id: 'farmer', look: 'farmer', x: 10, y: 11, dir: 'left', talk: 'farmer' },
    { id: 'child', look: 'child', x: 16, y: 13, dir: 'down', talk: 'child' },
    { id: 'fisherman', look: 'fisherman', x: 25, y: 10, dir: 'left', talk: 'fisherman' },
  ],
  objects: [
    { x: 11, y: 13, text: '一口老井，井水清凉。' },
    { x: 13, y: 4, text: '史家庄的正堂，大门紧闭着。' },
    { x: 14, y: 4, text: '史家庄的正堂，大门紧闭着。' },
  ],
  warps: [
    { x: 3, y: 4, to: 'hunter', tx: 4, ty: 6, dir: 'up' },
    { x: 18, y: 11, to: 'house2', tx: 4, ty: 6, dir: 'up' },
    { x: 4, y: 16, to: 'house3', tx: 4, ty: 6, dir: 'up' },
    { x: 18, y: 16, to: 'granny', tx: 4, ty: 6, dir: 'up' },
  ],
  triggers: [{ x: 13, y: 19, w: 2, event: 'village_exit' }],
  onEnter: 'arrive',
};

function interior(id: string, name: string, rows: string[], back: { tx: number; ty: number }, npcs: NpcDef[], objects: ObjDef[]): FieldMapDef {
  return {
    id,
    name,
    rows,
    npcs,
    objects,
    warps: [{ x: 4, y: 7, to: 'shijiacun', tx: back.tx, ty: back.ty, dir: 'down' }],
    triggers: [],
  };
}

const HUNTER = interior(
  'hunter',
  '猎户家',
  ['XXXXXXXXXX', 'XC_B__KK_X', 'X________X', 'X_______JX', 'X________X', 'X________X', 'X________X', 'XXXXEXXXXX'],
  { tx: 3, ty: 5 },
  [{ id: 'hunter', look: 'hunter', x: 6, y: 3, dir: 'down', talk: 'hunter' }],
  [
    { x: 1, y: 1, item: 'gongshuzhinan', flag: 'obj_hunter_cabinet' },
    { x: 8, y: 3, text: '罐子里装着腌好的野味。' },
  ],
);

const GRANNY = interior(
  'granny',
  '王婆婆家',
  ['XXXXXXXXXX', 'X_B____C_X', 'X________X', 'XJ_______X', 'X___KK___X', 'X________X', 'X________X', 'XXXXEXXXXX'],
  { tx: 18, ty: 17 },
  [{ id: 'granny', look: 'granny', x: 6, y: 3, dir: 'down', talk: 'granny' }],
  [
    { x: 1, y: 3, item: 'shangyao', flag: 'obj_granny_jar' },
    { x: 7, y: 1, text: '柜子里叠着几件旧衣裳。' },
  ],
);

const HOUSE2 = interior(
  'house2',
  '村民家',
  ['XXXXXXXXXX', 'XC_____B_X', 'X________X', 'X__KK____X', 'X________X', 'X_______JX', 'X________X', 'XXXXEXXXXX'],
  { tx: 18, ty: 12 },
  [{ id: 'woman', look: 'woman', x: 5, y: 2, dir: 'down', talk: 'woman' }],
  [
    { x: 1, y: 1, item: 'pijuancao', flag: 'obj_house2_cabinet' },
    { x: 8, y: 5, text: '罐子里是半罐米。' },
  ],
);

const HOUSE3 = interior(
  'house3',
  '村民家',
  ['XXXXXXXXXX', 'X_B___C__X', 'X________X', 'X____KK__X', 'X________X', 'XJ_______X', 'X________X', 'XXXXEXXXXX'],
  { tx: 4, ty: 17 },
  [{ id: 'girl', look: 'girl', x: 3, y: 3, dir: 'down', talk: 'girl' }],
  [
    { x: 6, y: 1, text: '柜子里放着针线。' },
    { x: 1, y: 5, text: '空罐子，什么也没有。' },
  ],
);

export const MAPS: Record<string, FieldMapDef> = Object.fromEntries([SHIJIACUN, HUNTER, GRANNY, HOUSE2, HOUSE3].map((m) => [m.id, m]));
