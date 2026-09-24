// 地图字符 → 地形种类。探索地图和战斗地图共用这一套字符。
export type TileKind =
  | 'grass'
  | 'road'
  | 'courtyard'
  | 'tree'
  | 'water'
  | 'bridge'
  | 'fence'
  | 'crops'
  | 'rock'
  | 'roof'
  | 'wall'
  | 'door'
  | 'shutdoor'
  | 'stonewall'
  | 'gate'
  | 'flowers'
  | 'hay'
  | 'well'
  | 'floor'
  | 'iwall'
  | 'cabinet'
  | 'jar'
  | 'bed'
  | 'table'
  | 'exit'
  | 'void';

export const LEGEND: Record<string, TileKind> = {
  '.': 'grass',
  ',': 'road',
  c: 'courtyard',
  T: 'tree',
  '~': 'water',
  '=': 'bridge',
  '#': 'fence',
  F: 'crops',
  r: 'rock',
  R: 'roof',
  W: 'wall',
  D: 'door',
  d: 'shutdoor',
  w: 'stonewall',
  G: 'gate',
  f: 'flowers',
  h: 'hay',
  L: 'well',
  _: 'floor',
  X: 'iwall',
  C: 'cabinet',
  J: 'jar',
  B: 'bed',
  K: 'table',
  E: 'exit',
  ' ': 'void',
};

export function parseRows(rows: string[]): TileKind[][] {
  return rows.map((row, y) =>
    [...row].map((ch, x) => {
      const k = LEGEND[ch];
      if (!k) throw new Error(`地图字符「${ch}」未定义（${x},${y}）`);
      return k;
    }),
  );
}

/** 探索时能走的地形（门要能踩上去才能进屋）。 */
const WALKABLE = new Set<TileKind>(['grass', 'road', 'courtyard', 'bridge', 'crops', 'door', 'gate', 'flowers', 'floor', 'exit']);

export function walkable(k: TileKind) {
  return WALKABLE.has(k);
}

export interface TerrainInfo {
  name: string;
  /** 移动消耗 */
  cost: number;
  /** 防御加成（比例） */
  def: number;
  /** 闪避加成（百分点） */
  eva: number;
  /** 只有会水的职业能进 */
  water?: boolean;
}

// 战斗地形效果（暂定数值，以后按原版核对）。不在表里的地形不能进入。
export const TERRAIN: Partial<Record<TileKind, TerrainInfo>> = {
  grass: { name: '平地', cost: 1, def: 0, eva: 0 },
  flowers: { name: '草地', cost: 1, def: 0, eva: 0 },
  road: { name: '道路', cost: 1, def: 0, eva: 0 },
  courtyard: { name: '庭院', cost: 1, def: 0, eva: 0 },
  bridge: { name: '桥', cost: 1, def: 0, eva: 0 },
  gate: { name: '庄门', cost: 1, def: 0.1, eva: 5 },
  tree: { name: '树林', cost: 2, def: 0.2, eva: 10 },
  crops: { name: '田地', cost: 2, def: 0, eva: 5 },
  water: { name: '河流', cost: 1, def: 0, eva: 10, water: true },
};

const BLOCK_NAMES: Partial<Record<TileKind, string>> = {
  roof: '房屋',
  wall: '房屋',
  door: '房屋',
  shutdoor: '房屋',
  stonewall: '围墙',
  fence: '篱笆',
  rock: '岩石',
  hay: '草垛',
  well: '水井',
};

export function terrainName(k: TileKind) {
  return TERRAIN[k]?.name ?? BLOCK_NAMES[k] ?? '障碍';
}
