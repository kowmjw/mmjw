// 原版战斗规则的测试。前半用合成的数据表；后半在本机有 ROM（rom/shuihu_hack.md，不进仓库）时，
// 拿真表核对在模拟器里实测到的数值。
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readBattleTables, type BattleTables, type Curve, type ItemDef } from '../src/rom/battledata';
import { RomData } from '../src/rom/data';
import {
  ALLY,
  alive,
  baseDamage,
  computeStats,
  counterDamage,
  endSideTurn,
  ENEMY,
  gainExp,
  makeUnit,
  moveRange,
  pathTo,
  performAttack,
  rest,
  Rng,
  startSideTurn,
  strikeExp,
  supportExp,
  targetsFrom,
  type Board,
  type BUnit,
} from '../src/orig/battle/rules';

/** 合成的数据表：所有职业移动 3、范围十字 1、能力曲线简单好算。 */
function fakeTables(over: Partial<BattleTables> = {}): BattleTables {
  const items: Record<number, ItemDef> = {
    1: { id: 1, power: 6, uses: 99, hits: 1, hit: 99, effect: 0 },
    2: { id: 2, power: 3, uses: 8, hits: 2, hit: 65, effect: 0 },
    0x51: { id: 0x51, power: 0, uses: 6, hits: 1, hit: 30, effect: 3 },
    0x60: { id: 0x60, power: 0, uses: 4, hits: 1, hit: 99, effect: 2 },
  };
  const curve = (base: number, num = 0, den = 1, cap = 255): Curve => ({ base, num, den, cap });
  const curves = Array.from({ length: 15 }, () => [curve(30, 3, 1), curve(10, 1, 1), curve(8), curve(5), curve(4), curve(0), curve(10), curve(5)]);
  const cross: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return {
    item: (id) => items[id] ?? null,
    canEquip: () => true,
    curves,
    move: [0, ...Array(30).fill(3)],
    passLimit: [0, ...Array(30).fill(0x4f)],
    ranges: [[], ...Array.from({ length: 30 }, () => cross)],
    // 类别 0：职业 1 → 3 级变职业 2
    promotions: [[1, 3, 2, 0x64], ...Array.from({ length: 14 }, () => [0, 0x64])],
    counter: Array(225).fill(0),
    expHit: [2, 5, 10, 15, 20, 25, 33, 50, 70, 80, 100, 100, 100, 100],
    expKill: [5, 12, 18, 24, 30, 42, 57, 80, 100, 100, 100, 100, 100, 100],
    ...over,
  };
}

function board(w: number, h: number, units: BUnit[], walls: [number, number][] = []): Board {
  const attr = new Uint8Array(w * h);
  for (const [x, y] of walls) attr[y * w + x] = 0x70;
  return { w, h, attr, units };
}

describe('随机数', () => {
  it('照原版公式：seed×0x7FCF+3 取模 0x7FED', () => {
    const r = new Rng(1);
    expect(r.next()).toBe((1 * 0x7fcf + 3) % 0x7fed);
    const s = r.seed;
    expect(r.next()).toBe((s * 0x7fcf + 3) % 0x7fed);
    for (let i = 0; i < 200; i++) {
      const v = r.roll();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(98);
    }
  });
});

describe('能力和升级', () => {
  it('基础 + (等级-1)×分子/分母，有上限；饰品 ×1.1', () => {
    const t = fakeTables();
    expect(computeStats(t, 0, 1).maxHp).toBe(30);
    expect(computeStats(t, 0, 5).maxHp).toBe(42);
    expect(computeStats(t, 0, 5).atk).toBe(14);
    expect(computeStats(t, 0, 5, 0x70).atk).toBe(15);
  });

  it('经验满 100 升级，多出的留着；到等级转职；升级不回血', () => {
    const t = fakeTables();
    const u = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 2, statClass: 0, cls: 1, exp: 90 });
    u.hp = 10;
    const r = gainExp(t, u, 25);
    expect(r.levelUp).toBe(true);
    expect(r.promoted).toBe(2);
    expect(u.level).toBe(3);
    expect(u.exp).toBe(15);
    expect(u.cls).toBe(2);
    expect(u.maxHp).toBe(36);
    expect(u.hp).toBe(10);
  });

  it('敌人不涨经验', () => {
    const t = fakeTables();
    const e = makeUnit(t, 0, { sprite: 58, side: ENEMY, x: 0, y: 0, level: 1, statClass: 0, cls: 1 });
    expect(gainExp(t, e, 200).levelUp).toBe(false);
    expect(e.exp).toBe(0);
  });

  it('经验表下标：打人按等级差 +5，辅助按等级差', () => {
    const t = fakeTables();
    const me = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 3, statClass: 0, cls: 1 });
    const foe = makeUnit(t, 1, { sprite: 58, side: ENEMY, x: 0, y: 0, level: 3, statClass: 0, cls: 1 });
    expect(strikeExp(t, me, foe, false)).toBe(25);
    expect(strikeExp(t, me, foe, true)).toBe(42);
    foe.level = 1;
    expect(strikeExp(t, me, foe, false)).toBe(15);
    foe.level = 30;
    expect(strikeExp(t, me, foe, true)).toBe(100);
    me.level = 20;
    foe.level = 1;
    expect(strikeExp(t, me, foe, false)).toBe(1);
    expect(supportExp(t, me, foe)).toBe(1);
    foe.level = 22;
    expect(supportExp(t, me, foe)).toBe(10);
  });
});

describe('移动范围', () => {
  it('敌人挡路，自己人能穿过但不能停，墙过不去', () => {
    const t = fakeTables();
    const me = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 2, y: 2, level: 1, statClass: 0, cls: 1 });
    const friend = makeUnit(t, 1, { sprite: 3, side: ALLY, x: 3, y: 2, level: 1, statClass: 0, cls: 1 });
    const foe = makeUnit(t, 2, { sprite: 58, side: ENEMY, x: 2, y: 1, level: 1, statClass: 0, cls: 1 });
    const b = board(7, 5, [me, friend, foe], [[1, 2]]);
    const r = moveRange(t, b, me);
    const has = (x: number, y: number) => r.cells.has(y * 7 + x);
    expect(has(2, 2)).toBe(true); // 原地
    expect(has(3, 2)).toBe(false); // 自己人占着
    expect(has(4, 2)).toBe(true); // 穿过自己人
    expect(has(5, 2)).toBe(true);
    expect(has(2, 1)).toBe(false); // 敌人
    expect(has(2, 0)).toBe(false); // 敌人后面（只能绕）……
    expect(has(1, 2)).toBe(false); // 墙
    expect(has(0, 2)).toBe(false); // 墙后面 3 步内绕不过去
    expect(pathTo(r, 7, 2 * 7 + 5)).toEqual([
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
  });
});

describe('攻击', () => {
  it('伤害 = (攻击+威力)×相克/10 − 防御，至少 1；虚弱、破甲减半', () => {
    const counter = Array(225).fill(0);
    counter[0 * 15 + 4] = 15;
    const t = fakeTables({ counter });
    const a = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1 });
    const d = makeUnit(t, 1, { sprite: 58, side: ENEMY, x: 1, y: 0, level: 1, statClass: 4, cls: 1 });
    const w = t.item(1)!;
    expect(baseDamage(t, a, d, w)).toBe(Math.floor(((10 + 6) * 15) / 10) - 5);
    d.armorBreak = 3;
    expect(baseDamage(t, a, d, w)).toBe(24 - 2);
    a.weaken = 3;
    expect(baseDamage(t, a, d, w)).toBe(Math.floor(((5 + 6) * 15) / 10) - 2);
    d.def = 99;
    d.armorBreak = 0;
    expect(baseDamage(t, a, d, w)).toBe(1);
    expect(counterDamage(t, d, a)).toBe(Math.max(1, d.atk - a.def));
  });

  it('打死不反击；没死且在对方范围里就反击；连击打两下', () => {
    const t = fakeTables();
    const a = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1, weapons: [2] });
    const d = makeUnit(t, 1, { sprite: 58, side: ENEMY, x: 1, y: 0, level: 1, statClass: 0, cls: 1, weapons: [1] });
    d.eva = 0;
    a.eva = 0;
    const b = board(4, 4, [a, d]);
    const r = performAttack(t, b, new Rng(7), a, 0, d);
    const mine = r.strikes.filter((s) => !s.counter);
    expect(mine.length).toBe(2);
    expect(r.strikes.some((s) => s.counter)).toBe(true);
    expect(a.uses[0]).toBe(7);
    d.hp = 1;
    d.dead = false;
    a.hit = 200;
    const r2 = performAttack(t, b, new Rng(7), a, 0, d);
    expect(d.dead).toBe(true);
    expect(r2.strikes.some((s) => s.counter)).toBe(false);
    expect(r2.exp[0].gain).toBeGreaterThan(0);
  });

  it('次数用完武器就没了；99 次的不减', () => {
    const t = fakeTables();
    const a = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1, weapons: [2, 1] });
    const d = makeUnit(t, 1, { sprite: 58, side: ENEMY, x: 3, y: 3, level: 50, statClass: 0, cls: 1 });
    const b = board(4, 4, [a, d]);
    a.uses[0] = 1;
    const r = performAttack(t, b, new Rng(1), a, 0, d);
    expect(r.broke).toBe(true);
    expect(a.weapons[0]).toBe(0);
    performAttack(t, b, new Rng(1), a, 1, d);
    expect(a.uses[1]).toBe(99);
  });

  it('医书只对受伤的自己人，混乱必中', () => {
    const t = fakeTables();
    const doc = makeUnit(t, 0, { sprite: 3, side: ALLY, x: 1, y: 1, level: 1, statClass: 0, cls: 1, weapons: [0x60, 0x51] });
    const pal = makeUnit(t, 1, { sprite: 1, side: ALLY, x: 1, y: 2, level: 1, statClass: 0, cls: 1 });
    const foe = makeUnit(t, 2, { sprite: 58, side: ENEMY, x: 2, y: 1, level: 1, statClass: 0, cls: 1 });
    const b = board(4, 4, [doc, pal, foe]);
    expect(targetsFrom(t, b, doc, 0, 1, 1)).toEqual([]);
    pal.hp = 5;
    expect(targetsFrom(t, b, doc, 0, 1, 1)).toEqual([pal]);
    expect(targetsFrom(t, b, doc, 1, 1, 1)).toEqual([foe]);
    const r = performAttack(t, b, new Rng(3), doc, 0, pal);
    expect(r.strikes[0].kind).toBe('heal');
    expect(pal.hp).toBe(Math.min(pal.maxHp, 55));
    foe.confuse = 2;
    const r2 = performAttack(t, b, new Rng(3), doc, 1, foe);
    expect(r2.strikes[0].kind).toBe('status');
  });
});

describe('回合', () => {
  it('没行动的人回合结束回 1/8；中毒扣 1/8 但不死；状态倒数', () => {
    const t = fakeTables();
    const u = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1 });
    const busy = makeUnit(t, 1, { sprite: 3, side: ALLY, x: 1, y: 0, level: 1, statClass: 0, cls: 1 });
    const b = board(3, 3, [u, busy]);
    u.hp = 10;
    busy.hp = 10;
    busy.acted = true;
    endSideTurn(b, ALLY);
    expect(u.hp).toBe(10 + (30 >> 3));
    expect(busy.hp).toBe(10);
    u.poison = 2;
    u.hp = 2;
    u.weaken = 1;
    startSideTurn(b, ALLY);
    expect(u.hp).toBe(1);
    expect(u.poison).toBe(1);
    expect(u.weaken).toBe(0);
    expect(busy.acted).toBe(false);
    expect(rest(u)).toBe(3);
    expect(alive(u)).toBe(true);
  });
});

// ───────── 真 ROM 的数值（只在本机有 ROM 时跑） ─────────

const ROM_PATH = 'rom/shuihu_hack.md';
const hasRom = existsSync(ROM_PATH);

describe.skipIf(!hasRom)('对照原版（需要本机 ROM）', () => {
  const t = hasRom ? readBattleTables(new RomData(new Uint8Array(readFileSync(ROM_PATH)))) : fakeTables();

  it('晁盖 1 级：HP33 攻13 法13 防10 法防9 必杀2 命中12 回避15 移动5；2 级 HP35', () => {
    const u = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1, weapons: [1] });
    expect([u.maxHp, u.atk, u.mag, u.def, u.mdef, u.crit, u.hit, u.eva, u.move]).toEqual([33, 13, 13, 10, 9, 2, 12, 15, 5]);
    expect(computeStats(t, 0, 2).maxHp).toBe(35);
  });

  it('晁盖用戒刀打 1 级刺客（官差）：18 点（模拟器里实测）', () => {
    const a = makeUnit(t, 0, { sprite: 1, side: ALLY, x: 0, y: 0, level: 1, statClass: 0, cls: 1, weapons: [1] });
    const d = makeUnit(t, 1, { sprite: 58, side: ENEMY, x: 1, y: 0, level: 1, statClass: 4, cls: 10, weapons: [1] });
    expect(d.maxHp).toBe(28);
    expect(baseDamage(t, a, d, t.item(1)!)).toBe(18);
  });

  it('职业表：刀客移动 5、十字范围；渔人能下水；戒刀刀客能装、弓箭手不能', () => {
    expect(t.move[1]).toBe(5);
    expect(t.ranges[1].length).toBe(4);
    expect(t.passLimit[13]).toBe(0x5f);
    expect(t.canEquip(1, 1)).toBe(true);
    expect(t.canEquip(1, 15)).toBe(false);
  });
});
