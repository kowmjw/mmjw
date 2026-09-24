// 原版模式的存档状态：对应原版 RAM 里剧情相关的那几块。

import { RomData } from '../rom/data';
import { mapEntry, NPC_MASK_MAPS } from '../rom/maps';

export interface OrigState {
  v: 1;
  kind: 'orig';
  /** 当前地图编号（$FFE100）和最后用的入口（$FFE102） */
  map: number;
  entry: number;
  /** 地图尺寸（入口表给的，存下来读档时用） */
  width: number;
  height: number;
  x: number;
  y: number;
  /** 0 上 1 下 2 左 3 右 */
  facing: number;
  /** 镜头左上角（像素） */
  camX: number;
  camY: number;
  /** 每组 32 位旗标（$FFE200） */
  flags: number[];
  /** NPC 对话进度（$FFE300） */
  talk: number[];
  /** 部分地图的 NPC 可见位图（$FFE2C0） */
  masks: number[];
  /** 世界地图各区域能去的地点（$FFE600） */
  regions: number[];
  /** 队伍（$FFE610，入队顺序） */
  party: number[];
  items: { id: number; n: number }[];
  money: number;
  /** 接下来的战斗编号（$FFE10F） */
  battle: number;
  time: number;
  /** 读档/开新游戏后要先跑的事件：[组, 事件号] */
  pending: [number, number] | null;
}

const NEW_GAME_MAP = 0x0106;
const NEW_GAME_ENTRY = 0x0100;
const MASK_INIT = 0x1828c;

export function newOrigState(rom: RomData): OrigState {
  const e = mapEntry(rom, NEW_GAME_ENTRY);
  return {
    v: 1,
    kind: 'orig',
    map: NEW_GAME_MAP,
    entry: NEW_GAME_ENTRY,
    width: e.width,
    height: e.height,
    x: e.x,
    y: e.y,
    facing: e.facing & 3,
    camX: e.camX * 32,
    camY: e.camY * 32,
    flags: new Array(16).fill(0),
    talk: new Array(256).fill(0),
    masks: NPC_MASK_MAPS.map((_, i) => rom.u16(MASK_INIT + i * 2)),
    regions: new Array(16).fill(0),
    party: [1],
    items: [],
    money: 0,
    battle: 0,
    time: 0,
    pending: [1, 0x41],
  };
}

export function isOrigState(s: unknown): s is OrigState {
  return typeof s === 'object' && s !== null && (s as { kind?: string }).kind === 'orig';
}
