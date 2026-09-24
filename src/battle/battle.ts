// 一场战斗的状态和规则（不涉及画面），战斗画面和单元测试都用它。
import type { BattleDef } from '../data/battles';
import { CHARS } from '../data/characters';
import { CLASSES, statsAt, type ClassId, type Stats } from '../data/classes';
import { ITEMS, takeItem, type Inventory, type ItemId } from '../data/items';
import { TERRAIN, parseRows, type TerrainInfo, type TileKind } from '../data/terrain';
import { flood, tracePath, type FloodNode, type Pt } from '../engine/path';
import type { Rng } from '../engine/rng';
import type { Member } from '../game/state';
import { HEAL_EXP, calcStrike, expForAttack, gainExp, healAmount, inRange, rollStrike, type LevelUp, type StrikeCalc } from './rules';

export type Side = 'player' | 'enemy';

export interface BattleUnit {
  uid: number;
  charId: string;
  name: string;
  side: Side;
  cls: ClassId;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  hit: number;
  eva: number;
  x: number;
  y: number;
  acted: boolean;
  alive: boolean;
  boss: boolean;
  leader: boolean;
  /** hold：原地驻守，有人靠近或受伤后才出击 */
  ai: 'aggressive' | 'hold';
  accessory: ItemId | null;
  member?: Member;
}

export interface StrikeEvent {
  attacker: number;
  defender: number;
  hit: boolean;
  crit: boolean;
  dmg: number;
  hpAfter: number;
  counter: boolean;
  calc: StrikeCalc;
}

export interface ExpEvent {
  uid: number;
  amount: number;
  levelUps: LevelUp[];
}

export interface AttackResult {
  strikes: StrikeEvent[];
  exp: ExpEvent[];
  defeated: number[];
}

export interface Reach {
  /** 扩散结果（含穿过友军的中间格），用来还原路线 */
  nodes: Map<number, FloodNode>;
  /** 能停下的格子 */
  tiles: Pt[];
  canStop(x: number, y: number): boolean;
}

export interface Forecast {
  strike: StrikeCalc;
  counter: StrikeCalc | null;
}

const BOSS_BONUS = { hp: 40, atk: 0, def: 3 };
const NO_TERRAIN: TerrainInfo = { name: '', cost: 1, def: 0, eva: 0 };

function accessoryBonus(id: ItemId | null): Partial<Stats> {
  return id ? (ITEMS[id].bonus ?? {}) : {};
}

export class Battle {
  readonly tiles: TileKind[][];
  readonly w: number;
  readonly h: number;
  readonly units: BattleUnit[] = [];
  turn = 1;
  phase: Side = 'player';

  constructor(
    readonly def: BattleDef,
    party: Member[],
    readonly inv: Inventory,
    readonly rng: Rng,
  ) {
    this.tiles = parseRows(def.rows);
    this.h = this.tiles.length;
    this.w = this.tiles[0].length;
    let uid = 1;
    const spots = [...def.deploy];
    const pending = [...party];
    // 先放指定了位置的人，其余按顺序填空位
    for (const spot of def.deploy) {
      if (!spot.id) continue;
      const i = pending.findIndex((m) => m.id === spot.id);
      if (i < 0) continue;
      this.units.push(this.fromMember(uid++, pending[i], spot));
      pending.splice(i, 1);
      spots.splice(spots.indexOf(spot), 1);
    }
    for (const m of pending) {
      const spot = spots.shift();
      if (!spot) break;
      this.units.push(this.fromMember(uid++, m, spot));
    }
    for (const e of def.enemies) {
      const c = CHARS[e.id];
      const level = e.level ?? c.level;
      const s = statsAt(c.cls, level);
      const bonus = e.boss ? BOSS_BONUS : { hp: 0, atk: 0, def: 0 };
      this.units.push({
        uid: uid++,
        charId: e.id,
        name: c.name,
        side: 'enemy',
        cls: c.cls,
        level,
        exp: 0,
        hp: s.hp + bonus.hp,
        maxHp: s.hp + bonus.hp,
        atk: s.atk + bonus.atk,
        def: s.def + bonus.def,
        hit: s.hit,
        eva: s.eva,
        x: e.x,
        y: e.y,
        acted: false,
        alive: true,
        boss: !!e.boss,
        leader: false,
        ai: e.hold ? 'hold' : 'aggressive',
        accessory: null,
      });
    }
  }

  private fromMember(uid: number, m: Member, at: Pt): BattleUnit {
    const b = accessoryBonus(m.accessory);
    return {
      uid,
      charId: m.id,
      name: CHARS[m.id].name,
      side: 'player',
      cls: m.cls,
      level: m.level,
      exp: m.exp,
      hp: m.hp + (b.hp ?? 0),
      maxHp: m.hp + (b.hp ?? 0),
      atk: m.atk + (b.atk ?? 0),
      def: m.def + (b.def ?? 0),
      hit: m.hit + (b.hit ?? 0),
      eva: m.eva + (b.eva ?? 0),
      x: at.x,
      y: at.y,
      acted: false,
      alive: true,
      boss: false,
      leader: m.id === this.def.leader,
      ai: 'aggressive',
      accessory: m.accessory,
      member: m,
    };
  }

  get living() {
    return this.units.filter((u) => u.alive);
  }

  byUid(uid: number) {
    return this.units.find((u) => u.uid === uid)!;
  }

  unitAt(x: number, y: number) {
    return this.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  terrain(x: number, y: number): TerrainInfo | null {
    return TERRAIN[this.tiles[y][x]] ?? null;
  }

  /** 这个职业走进 (x,y) 的消耗（不考虑单位），过不去返回 Infinity。 */
  terrainCost(cls: ClassId, x: number, y: number) {
    const t = this.terrain(x, y);
    const c = CLASSES[cls];
    if (!t) return Infinity;
    if (t.water && !c.water && !c.fly) return Infinity;
    return c.fly ? 1 : t.cost;
  }

  /** 这个单位这回合能走到的范围（可以穿过友军，不能穿过敌人，不能停在别人身上）。 */
  reach(u: BattleUnit): Reach {
    const nodes = flood(
      this.w,
      this.h,
      u,
      (x, y) => {
        const o = this.unitAt(x, y);
        if (o && o.side !== u.side) return Infinity;
        return this.terrainCost(u.cls, x, y);
      },
      CLASSES[u.cls].mov,
    );
    const tiles: Pt[] = [];
    for (const k of nodes.keys()) {
      const x = k % this.w;
      const y = (k - x) / this.w;
      const o = this.unitAt(x, y);
      if (!o || o === u) tiles.push({ x, y });
    }
    const stops = new Set(tiles.map((t) => t.y * this.w + t.x));
    return { nodes, tiles, canStop: (x, y) => stops.has(y * this.w + x) };
  }

  pathTo(r: Reach, x: number, y: number): Pt[] {
    return tracePath(r.nodes, this.w, { x, y });
  }

  foesOf(u: BattleUnit) {
    return this.units.filter((o) => o.alive && o.side !== u.side);
  }

  alliesOf(u: BattleUnit) {
    return this.units.filter((o) => o.alive && o.side === u.side && o !== u);
  }

  targetsFrom(u: BattleUnit, x: number, y: number) {
    const range = CLASSES[u.cls].range;
    return this.foesOf(u).filter((t) => inRange(range, t.x - x, t.y - y));
  }

  healTargetsFrom(u: BattleUnit, x: number, y: number) {
    if (!CLASSES[u.cls].heal) return [];
    return this.alliesOf(u).filter((t) => t.hp < t.maxHp && Math.abs(t.x - x) + Math.abs(t.y - y) === 1);
  }

  /** 用道具的对象：自己和相邻的同伴。 */
  itemTargetsFrom(u: BattleUnit, x: number, y: number) {
    return [u, ...this.alliesOf(u).filter((t) => Math.abs(t.x - x) + Math.abs(t.y - y) === 1)];
  }

  private canCounter(def: BattleUnit, attX: number, attY: number) {
    return def.alive && inRange(CLASSES[def.cls].range, attX - def.x, attY - def.y);
  }

  /** 攻击预测：攻击方站在 (ax, ay) 打 def。 */
  forecast(att: BattleUnit, def: BattleUnit, ax = att.x, ay = att.y): Forecast {
    const strike = calcStrike(att, def, this.terrain(def.x, def.y) ?? NO_TERRAIN);
    const counter = this.canCounter(def, ax, ay) ? calcStrike(def, att, this.terrain(ax, ay) ?? NO_TERRAIN) : null;
    return { strike, counter };
  }

  move(u: BattleUnit, x: number, y: number) {
    u.x = x;
    u.y = y;
  }

  /** 攻击一次；对方没倒且够得着就反击。我方单位打出手就有经验。 */
  attack(att: BattleUnit, def: BattleUnit): AttackResult {
    const res: AttackResult = { strikes: [], exp: [], defeated: [] };
    const exp = new Map<number, number>();
    const addExp = (u: BattleUnit, n: number) => {
      if (u.side === 'player') exp.set(u.uid, (exp.get(u.uid) ?? 0) + n);
    };
    const strike = (a: BattleUnit, d: BattleUnit, counter: boolean) => {
      const calc = calcStrike(a, d, this.terrain(d.x, d.y) ?? NO_TERRAIN);
      const r = rollStrike(calc, this.rng);
      d.hp = Math.max(0, d.hp - r.dmg);
      const killed = d.hp === 0;
      if (killed) {
        d.alive = false;
        res.defeated.push(d.uid);
      }
      res.strikes.push({ attacker: a.uid, defender: d.uid, hit: r.hit, crit: r.crit, dmg: r.dmg, hpAfter: d.hp, counter, calc });
      addExp(a, expForAttack(a, d, r.hit, killed));
    };
    strike(att, def, false);
    if (this.canCounter(def, att.x, att.y)) strike(def, att, true);
    for (const [uid, amount] of exp) {
      const u = this.byUid(uid);
      if (!u.alive) continue;
      res.exp.push({ uid, amount, levelUps: gainExp(u, amount, this.rng) });
    }
    return res;
  }

  heal(healer: BattleUnit, target: BattleUnit): { amount: number; exp: ExpEvent } {
    const amount = Math.min(target.maxHp - target.hp, healAmount(healer));
    target.hp += amount;
    return { amount, exp: { uid: healer.uid, amount: HEAL_EXP, levelUps: gainExp(healer, HEAL_EXP, this.rng) } };
  }

  useItem(target: BattleUnit, item: ItemId): number {
    const def = ITEMS[item];
    if (!def.heal || !takeItem(this.inv, item)) return 0;
    const amount = Math.min(target.maxHp - target.hp, def.heal);
    target.hp += amount;
    return amount;
  }

  allActed(side: Side) {
    return this.units.every((u) => !u.alive || u.side !== side || u.acted);
  }

  beginPhase(side: Side) {
    if (side === 'player' && this.phase === 'enemy') this.turn++;
    this.phase = side;
    for (const u of this.units) if (u.side === side) u.acted = false;
  }

  outcome(): 'win' | 'lose' | null {
    const leader = this.units.find((u) => u.leader);
    if (leader && !leader.alive) return 'lose';
    if (!this.units.some((u) => u.side === 'player' && u.alive)) return 'lose';
    if (this.def.winDefeat) {
      const boss = this.units.find((u) => u.side === 'enemy' && u.charId === this.def.winDefeat);
      if (boss && !boss.alive) return 'win';
    }
    if (!this.units.some((u) => u.side === 'enemy' && u.alive)) return 'win';
    return null;
  }

  /** 战斗结束后把等级、经验、转职写回队伍（去掉饰品加成）。 */
  syncParty() {
    for (const u of this.units) {
      const m = u.member;
      if (!m) continue;
      const b = accessoryBonus(u.accessory);
      m.cls = u.cls;
      m.level = u.level;
      m.exp = u.exp;
      m.hp = u.maxHp - (b.hp ?? 0);
      m.atk = u.atk - (b.atk ?? 0);
      m.def = u.def - (b.def ?? 0);
      m.hit = u.hit - (b.hit ?? 0);
      m.eva = u.eva - (b.eva ?? 0);
    }
  }
}
