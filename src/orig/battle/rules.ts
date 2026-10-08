// 原版战斗规则（纯逻辑，不碰画面）。算法照原版 68000 代码，出处写在各函数的注释里；
// 数据表从 ROM 读（src/rom/battledata.ts），测试里用合成的表。

import { EFFECT, itemKind, type BattleTables, type ItemDef } from '../../rom/battledata';

export const ALLY = 0;
export const ENEMY = 1;

export type AiMode = 'charge' | 'hold' | 'goal' | 'still';

export interface UnitAi {
  /** charge：见人就追；hold：有人进了攻击距离才动；goal：往某格走，路上有人就打；still：原地不动（能打就打） */
  mode: AiMode;
  goal?: [number, number];
  /** 第几回合起才行动（伏兵） */
  wake?: number;
}

export interface BUnit {
  uid: number;
  /** 行走图号（单位记录 +00） */
  sprite: number;
  /** 名字和头像号（+07） */
  name: number;
  side: number;
  x: number;
  y: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  mdef: number;
  crit: number;
  hit: number;
  eva: number;
  move: number;
  /** 能力类别 0–14（+21），决定成长和相克 */
  statClass: number;
  /** 职业 1–30（+24），决定移动、攻击范围、能装什么 */
  cls: number;
  /** 4 个武器栏（+26）和剩余次数（+2B），0 表示空 */
  weapons: number[];
  uses: number[];
  /** 4 个随身道具（+08） */
  items: number[];
  accessory: number;
  /** 混乱、中毒、虚弱、破甲的剩余回合（+0C–+0F） */
  confuse: number;
  poison: number;
  weaken: number;
  armorBreak: number;
  moved: boolean;
  acted: boolean;
  dead: boolean;
  /** 还没出场的伏兵 */
  hidden: boolean;
  ai?: UnitAi;
  /** 这个人死了就输（主角等） */
  leader?: boolean;
}

export interface Stats {
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  mdef: number;
  crit: number;
  hit: number;
  eva: number;
}

/** 原版的随机数（$604E）：seed = (seed × 0x7FCF + 3) mod 0x7FED。 */
export class Rng {
  constructor(public seed = 0x1234) {}
  next() {
    this.seed = (this.seed * 0x7fcf + 3) % 0x7fed;
    return this.seed;
  }
  /** 0–98 的百分比骰子：(seed & 0x3F) × 100 >> 6。 */
  roll() {
    return ((this.next() & 0x3f) * 100) >> 6;
  }
}

/** 饰品加成（×1.1）：道具号 → 加成的能力。 */
const ACCESSORY_STAT: Record<number, keyof Stats> = {
  0x76: 'maxHp',
  0x70: 'atk',
  0x72: 'mag',
  0x71: 'def',
  0x73: 'mdef',
  0x74: 'hit',
  0x75: 'eva',
};

/** 按能力类别和等级算能力（原版 $14C80）：基础 + (等级-1)×分子/分母，不超过上限；饰品再 ×1.1。 */
export function computeStats(t: BattleTables, statClass: number, level: number, accessory = 0): Stats {
  const c = t.curves[statClass] ?? t.curves[0];
  const v = (i: number) => Math.min(c[i].cap, c[i].base + Math.floor(((level - 1) * c[i].num) / c[i].den));
  const s: Stats = { maxHp: v(0), atk: v(1), mag: v(2), def: v(3), mdef: v(4), crit: v(5), hit: v(6), eva: v(7) };
  const k = ACCESSORY_STAT[accessory];
  if (k) s[k] = Math.floor((s[k] * 11) / 10);
  return s;
}

/** 重算能力和移动力（当前 HP 不动，原版升级也不回血）。 */
export function applyStats(t: BattleTables, u: BUnit) {
  Object.assign(u, computeStats(t, u.statClass, u.level, u.accessory));
  u.move = t.move[u.cls] ?? 4;
  u.hp = Math.min(u.hp, u.maxHp);
}

export interface NewUnit {
  sprite: number;
  name?: number;
  side: number;
  x: number;
  y: number;
  level: number;
  statClass: number;
  cls: number;
  weapons?: number[];
  items?: number[];
  accessory?: number;
  exp?: number;
  hp?: number;
  ai?: UnitAi;
  leader?: boolean;
  hidden?: boolean;
}

export function makeUnit(t: BattleTables, uid: number, d: NewUnit): BUnit {
  const weapons = [...(d.weapons ?? [])].slice(0, 4);
  while (weapons.length < 4) weapons.push(0);
  const items = [...(d.items ?? [])].slice(0, 4);
  while (items.length < 4) items.push(0);
  const u: BUnit = {
    uid,
    sprite: d.sprite,
    name: d.name ?? d.sprite,
    side: d.side,
    x: d.x,
    y: d.y,
    level: d.level,
    exp: d.exp ?? 0,
    hp: 0,
    maxHp: 0,
    atk: 0,
    mag: 0,
    def: 0,
    mdef: 0,
    crit: 0,
    hit: 0,
    eva: 0,
    move: 0,
    statClass: d.statClass,
    cls: d.cls,
    weapons,
    uses: weapons.map((w) => (w ? (t.item(w)?.uses ?? 0) : 0)),
    items,
    accessory: d.accessory ?? 0,
    confuse: 0,
    poison: 0,
    weaken: 0,
    armorBreak: 0,
    moved: false,
    acted: false,
    dead: false,
    hidden: d.hidden ?? false,
    ai: d.ai,
    leader: d.leader,
  };
  applyStats(t, u);
  u.hp = d.hp !== undefined ? Math.min(d.hp, u.maxHp) : u.maxHp;
  return u;
}

export function alive(u: BUnit) {
  return !u.dead && !u.hidden;
}

// ───────── 地图和移动 ─────────

export interface Board {
  w: number;
  h: number;
  /** 地图属性层（每格一个字节，和探索时同一张表） */
  attr: Uint8Array;
  units: BUnit[];
}

const DIRS: [number, number][] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

/** 能走的地形上限（原版 $69B0）：职业表，朱雀羽鞋 0x6F，玄武水鞋 0x5F。 */
export function passLimit(t: BattleTables, u: BUnit) {
  if (u.accessory === 0x77) return 0x6f;
  if (u.accessory === 0x78) return 0x5f;
  return t.passLimit[u.cls] ?? 0x4f;
}

export function unitAt(b: Board, x: number, y: number) {
  return b.units.find((o) => alive(o) && o.x === x && o.y === y) ?? null;
}

export interface MoveRange {
  /** 格子号（y×w+x）→ 剩余步数；只含能停的格子（包括原地） */
  cells: Map<number, number>;
  /** 最短路上的上一格，-1 表示起点 */
  parent: Int32Array;
}

/**
 * 移动范围（原版 $6A00 的洪水填充）：每步 1 点，属性值小于上限才能走；
 * 敌人占的格子过不去，自己人的格子能穿过但不能停。
 */
export function moveRange(t: BattleTables, b: Board, u: BUnit): MoveRange {
  const n = b.w * b.h;
  const left = new Int16Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const blocked = new Uint8Array(n);
  for (const o of b.units) if (alive(o) && o.side !== u.side) blocked[o.y * b.w + o.x] = 1;
  const lim = passLimit(t, u);
  const start = u.y * b.w + u.x;
  left[start] = u.move;
  let frontier = [start];
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const l = left[i];
      if (l <= 0) continue;
      const x = i % b.w;
      const y = (i - x) / b.w;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
        const j = ny * b.w + nx;
        if (blocked[j] || b.attr[j] >= lim || left[j] >= l - 1) continue;
        left[j] = l - 1;
        parent[j] = i;
        next.push(j);
      }
    }
    frontier = next;
  }
  const cells = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (left[i] < 0) continue;
    const x = i % b.w;
    const y = (i - x) / b.w;
    const o = unitAt(b, x, y);
    if (o && o !== u) continue;
    cells.set(i, left[i]);
  }
  return { cells, parent };
}

/** 从起点走到 dest 的格子序列（不含起点）。 */
export function pathTo(r: MoveRange, w: number, dest: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = dest; i >= 0 && r.parent[i] !== -1; i = r.parent[i]) out.unshift([i % w, Math.floor(i / w)]);
  return out;
}

/** 某职业站在 (x,y) 时打得到的格子（原版 $AEB2 的偏移表）。 */
export function attackCells(t: BattleTables, b: Board, cls: number, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of t.ranges[cls] ?? []) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h) out.push([nx, ny]);
  }
  return out;
}

export function inAttackRange(t: BattleTables, b: Board, cls: number, fx: number, fy: number, tx: number, ty: number) {
  return attackCells(t, b, cls, fx, fy).some(([x, y]) => x === tx && y === ty);
}

// ───────── 武器和目标 ─────────

/** 武器是不是用在自己人身上的（医书、解除状态、再行动）。 */
export function supportsAllies(d: ItemDef | null) {
  if (!d) return false;
  return d.effect === EFFECT.heal || (d.effect >= 7 && d.effect <= 15 && d.effect !== 12);
}

/** 用第 slot 个武器、站在 (x,y) 时能选的目标。 */
export function targetsFrom(t: BattleTables, b: Board, u: BUnit, slot: number, x: number, y: number): BUnit[] {
  const d = t.item(u.weapons[slot]);
  if (!d || u.uses[slot] <= 0) return [];
  const toAllies = supportsAllies(d);
  const out: BUnit[] = [];
  for (const [cx, cy] of attackCells(t, b, u.cls, x, y)) {
    const o = unitAt(b, cx, cy);
    if (!o || o === u) continue;
    if (toAllies ? o.side === u.side : o.side !== u.side) {
      if (toAllies && d.effect === EFFECT.heal && o.hp >= o.maxHp) continue;
      out.push(o);
    }
  }
  return out;
}

/** 能用的武器栏（有东西、还有次数）。 */
export function usableSlots(t: BattleTables, u: BUnit) {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) if (u.weapons[i] && u.uses[i] > 0 && t.item(u.weapons[i])) out.push(i);
  return out;
}

// ───────── 命中和伤害 ─────────

/** 命中判定（原版 $5FDC）：命中 + 武器命中 − 对方回避；对方混乱必中。 */
export function hitChance(att: BUnit, def: BUnit, w: ItemDef) {
  if (def.confuse > 0) return 100;
  return att.hit + w.hit - def.eva;
}

export function rollHit(rng: Rng, att: BUnit, def: BUnit, w: ItemDef) {
  if (def.confuse > 0) return true;
  const c = att.hit + w.hit - def.eva;
  if (c < 0) return false;
  return rng.roll() <= c;
}

/** 伤害（原版 $6070）：(攻击或法力，虚弱减半) + 武器威力，乘相克，减 (防御或法防，破甲减半)，至少 1。 */
export function baseDamage(t: BattleTables, att: BUnit, def: BUnit, w: ItemDef) {
  const magic = w.effect !== EFFECT.physical;
  let d = magic ? att.mag : att.atk;
  if (att.weaken > 0) d >>= 1;
  d += w.power;
  const k = t.counter[att.statClass * 15 + def.statClass] ?? 0;
  if (k) d = Math.floor((d * k) / 10);
  let armor = magic ? def.mdef : def.def;
  if (def.armorBreak > 0) armor >>= 1;
  return Math.max(1, d - armor);
}

/** 反击伤害（原版 $B58C）：只看攻击/法力和防御/法防，不加武器威力，不算相克。 */
export function counterDamage(t: BattleTables, counterer: BUnit, victim: BUnit) {
  const w = t.item(counterer.weapons[0]);
  const magic = !!w && w.effect !== EFFECT.physical;
  let d = magic ? counterer.mag : counterer.atk;
  if (counterer.weaken > 0) d >>= 1;
  let armor = magic ? victim.mdef : victim.def;
  if (victim.armorBreak > 0) armor >>= 1;
  return Math.max(1, d - armor);
}

/** 会心（原版 $5F9C）：骰子不大于必杀就 ×1.5。critStat 是攻方的必杀。 */
export function rollCrit(rng: Rng, critStat: number, dmg: number) {
  if (rng.roll() <= critStat) return { dmg: dmg + (dmg >> 1), crit: true };
  return { dmg, crit: false };
}

// ───────── 经验和升级 ─────────

/** 伤到/打倒敌人得的经验（原版 $5E4E）：下标 = 对方等级 + 5 − 自己等级，最多 13；负数只给 1。 */
export function strikeExp(t: BattleTables, me: BUnit, target: BUnit, kill: boolean) {
  const i = target.level + 5 - me.level;
  if (i < 0) return 1;
  return (kill ? t.expKill : t.expHit)[Math.min(13, i)];
}

/** 治疗、施咒成功的经验（原版 $14FF2）：下标 = 对方等级 − 自己等级，最多 8；负数只给 1。 */
export function supportExp(t: BattleTables, me: BUnit, target: BUnit) {
  const i = target.level - me.level;
  if (i < 0) return 1;
  return t.expHit[Math.min(8, i)];
}

export interface ExpResult {
  unit: BUnit;
  gain: number;
  levelUp: boolean;
  /** 转职后的新职业 */
  promoted: number | null;
}

/** 加经验，满 100 升一级（多出的留下），到了转职等级换职业（原版 $5E84 / $15032）。 */
export function gainExp(t: BattleTables, u: BUnit, gain: number): ExpResult {
  const r: ExpResult = { unit: u, gain, levelUp: false, promoted: null };
  if (u.side !== ALLY || gain <= 0) return r;
  u.exp += gain;
  if (u.exp <= 99) return r;
  u.exp -= 100;
  if (u.level >= 99) {
    u.exp = 99;
    return r;
  }
  u.level++;
  r.levelUp = true;
  const list = t.promotions[u.statClass] ?? [];
  for (let i = 1; i + 1 < list.length && list[i] !== 0x64; i += 2) {
    if (list[i] === u.level) {
      u.cls = list[i + 1];
      r.promoted = u.cls;
    }
  }
  applyStats(t, u);
  return r;
}

// ───────── 一次攻击的全过程 ─────────

export type StrikeKind = 'damage' | 'miss' | 'status' | 'resist' | 'heal' | 'cure' | 'again';

export interface Strike {
  from: BUnit;
  to: BUnit;
  kind: StrikeKind;
  counter: boolean;
  crit: boolean;
  /** 伤害或回复量 */
  amount: number;
  hpBefore: number;
  hpAfter: number;
  killed: boolean;
  status?: 'confuse' | 'poison' | 'weaken' | 'armorBreak';
}

export interface ActionResult {
  strikes: Strike[];
  exp: ExpResult[];
  /** 武器用完了 */
  broke: boolean;
}

/** 治疗量（原版 $A5FE）：去伤丸 25、九转丹 75、伤药/刀伤药典 50、雪山参/快愈药引 100，其它回满。 */
export function healAmount(item: number, u: BUnit) {
  switch (item) {
    case 0x85:
      return 25;
    case 0x86:
      return 75;
    case 0x60:
    case 0x80:
      return 50;
    case 0x61:
    case 0x81:
      return 100;
    default:
      return u.maxHp;
  }
}

const STATUS_BY_EFFECT: Record<number, Strike['status']> = {
  [EFFECT.confuse]: 'confuse',
  [EFFECT.poison]: 'poison',
  [EFFECT.weaken]: 'weaken',
  [EFFECT.armorBreak]: 'armorBreak',
};

/** 状态持续的回合数。 */
export const STATUS_TURNS = 3;

function damageStrike(from: BUnit, to: BUnit, dmg: number, crit: boolean, counter: boolean): Strike {
  const hpBefore = to.hp;
  to.hp = Math.max(0, to.hp - dmg);
  const killed = to.hp === 0;
  if (killed) to.dead = true;
  return { from, to, kind: 'damage', counter, crit, amount: dmg, hpBefore, hpAfter: to.hp, killed };
}

/**
 * u 用第 slot 个武器对 target 出手（原版状态机 $5644 → $4976 → $B4A8）：
 * 先扣一次武器次数；伤害类武器按连击数打几下，每下各自判定命中、会心，打中给经验；
 * 对方还活着、没混乱、而且自己在对方攻击范围里，就吃一次反击。咒术和医术不会被反击。
 */
export function performAttack(t: BattleTables, b: Board, rng: Rng, u: BUnit, slot: number, target: BUnit): ActionResult {
  const w = t.item(u.weapons[slot]);
  const res: ActionResult = { strikes: [], exp: [], broke: false };
  if (!w) return res;
  if (u.uses[slot] !== 99) {
    u.uses[slot] = Math.max(0, u.uses[slot] - 1);
    if (u.uses[slot] === 0) {
      u.weapons[slot] = 0;
      res.broke = true;
    }
  }
  let expGain = 0;
  if (w.effect === EFFECT.physical || w.effect === EFFECT.magic) {
    for (let h = 0; h < w.hits && !target.dead; h++) {
      if (!rollHit(rng, u, target, w)) {
        res.strikes.push({ from: u, to: target, kind: 'miss', counter: false, crit: false, amount: 0, hpBefore: target.hp, hpAfter: target.hp, killed: false });
        continue;
      }
      const c = rollCrit(rng, u.crit, baseDamage(t, u, target, w));
      const s = damageStrike(u, target, c.dmg, c.crit, false);
      res.strikes.push(s);
      expGain += strikeExp(t, u, target, s.killed);
    }
    if (!target.dead && !u.dead && target.confuse === 0 && inAttackRange(t, b, target.cls, target.x, target.y, u.x, u.y)) {
      // 原版反击的命中判定（$A318）用的是出手一方的命中和它第一件武器，减反击一方的回避
      const w0 = t.item(u.weapons[0]);
      const c = u.hit + (w0?.hit ?? 0) - target.eva;
      const hitOk = c >= 0 && rng.roll() <= c;
      if (hitOk) {
        // 原版反击的会心用的是出手那一方的必杀（$5F9C 读的是 $FF606B）
        const cr = rollCrit(rng, u.crit, counterDamage(t, target, u));
        res.strikes.push(damageStrike(target, u, cr.dmg, cr.crit, true));
      } else {
        res.strikes.push({ from: target, to: u, kind: 'miss', counter: true, crit: false, amount: 0, hpBefore: u.hp, hpAfter: u.hp, killed: false });
      }
    }
  } else if (STATUS_BY_EFFECT[w.effect]) {
    const status = STATUS_BY_EFFECT[w.effect]!;
    if (rollHit(rng, u, target, w)) {
      target[status] = STATUS_TURNS;
      res.strikes.push({ from: u, to: target, kind: 'status', counter: false, crit: false, amount: 0, hpBefore: target.hp, hpAfter: target.hp, killed: false, status });
      expGain += supportExp(t, u, target);
    } else {
      res.strikes.push({ from: u, to: target, kind: 'resist', counter: false, crit: false, amount: 0, hpBefore: target.hp, hpAfter: target.hp, killed: false, status });
    }
  } else if (w.effect === EFFECT.heal) {
    res.strikes.push(healStrike(u, target, healAmount(w.id, target)));
    expGain += supportExp(t, u, target);
  } else {
    // 解除状态、再行动
    const before = target.hp;
    if (w.effect === 7) target.confuse = 0;
    else if (w.effect === 8) target.poison = 0;
    else if (w.effect === 9) target.weaken = 0;
    else if (w.effect === 10) target.armorBreak = 0;
    else if (w.effect === 11) {
      target.acted = false;
      target.moved = false;
    } else if (w.effect === 13) target.confuse = target.poison = target.weaken = target.armorBreak = 0;
    res.strikes.push({ from: u, to: target, kind: w.effect === 11 ? 'again' : 'cure', counter: false, crit: false, amount: 0, hpBefore: before, hpAfter: target.hp, killed: false });
    expGain += supportExp(t, u, target);
  }
  if (!u.dead && expGain > 0) res.exp.push(gainExp(t, u, expGain));
  return res;
}

function healStrike(from: BUnit, to: BUnit, amount: number): Strike {
  const hpBefore = to.hp;
  to.hp = Math.min(to.maxHp, to.hp + amount);
  return { from, to, kind: 'heal', counter: false, crit: false, amount: to.hp - hpBefore, hpBefore, hpAfter: to.hp, killed: false };
}

/** 能在战斗里用的消耗品。 */
export function usableItem(id: number) {
  return id === 0x80 || id === 0x81 || id === 0x82 || id === 0x83 || id === 0x84 || id === 0x85 || id === 0x86;
}

/** 用随身道具（伤药之类）。道具用掉，给自己或相邻的自己人。 */
export function useItem(t: BattleTables, u: BUnit, index: number, target: BUnit): ActionResult {
  const id = u.items[index];
  const res: ActionResult = { strikes: [], exp: [], broke: false };
  if (!usableItem(id)) return res;
  u.items[index] = 0;
  if (id === 0x83) {
    target.poison = 0;
    res.strikes.push({ from: u, to: target, kind: 'cure', counter: false, crit: false, amount: 0, hpBefore: target.hp, hpAfter: target.hp, killed: false });
  } else if (id === 0x84) {
    target.confuse = 0;
    res.strikes.push({ from: u, to: target, kind: 'cure', counter: false, crit: false, amount: 0, hpBefore: target.hp, hpAfter: target.hp, killed: false });
  } else {
    res.strikes.push(healStrike(u, target, healAmount(id, target)));
  }
  if (target !== u) res.exp.push(gainExp(t, u, supportExp(t, u, target)));
  return res;
}

/** 休息（指令栏的旗子）：回复最大 HP 的 1/8。回合结束时没行动的人也会自动休息。 */
export function rest(u: BUnit) {
  const hpBefore = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + (u.maxHp >> 3));
  return u.hp - hpBefore;
}

/** 一方回合开始：状态倒数，中毒扣最大 HP 的 1/8（至少 1，不会毒死）。返回中毒扣的血。 */
export function startSideTurn(b: Board, side: number) {
  const hurt: { unit: BUnit; amount: number }[] = [];
  for (const u of b.units) {
    if (!alive(u) || u.side !== side) continue;
    u.moved = false;
    u.acted = false;
    if (u.poison > 0) {
      const amount = Math.min(u.hp - 1, Math.max(1, u.maxHp >> 3));
      if (amount > 0) {
        u.hp -= amount;
        hurt.push({ unit: u, amount });
      }
      u.poison--;
    }
    if (u.confuse > 0) u.confuse--;
    if (u.weaken > 0) u.weaken--;
    if (u.armorBreak > 0) u.armorBreak--;
  }
  return hurt;
}

/** 一方回合结束：没行动的人自动休息。 */
export function endSideTurn(b: Board, side: number) {
  const healed: { unit: BUnit; amount: number }[] = [];
  for (const u of b.units) {
    if (!alive(u) || u.side !== side || u.acted) continue;
    const amount = rest(u);
    if (amount > 0) healed.push({ unit: u, amount });
  }
  return healed;
}

/** 道具能不能装在这个人身上（武器栏或饰品栏）。 */
export function canEquip(t: BattleTables, u: { cls: number }, item: number) {
  const k = itemKind(item);
  return (k === 'weapon' || k === 'accessory') && t.canEquip(item, u.cls);
}
