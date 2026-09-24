import { describe, expect, it } from 'vitest';
import { planEnemy } from '../src/battle/ai';
import { Battle, type BattleUnit } from '../src/battle/battle';
import { calcStrike, counterMult, gainExp, inRange } from '../src/battle/rules';
import { BATTLES } from '../src/data/battles';
import { CLASSES, statsAt } from '../src/data/classes';
import { TERRAIN } from '../src/data/terrain';
import { mulberry32 } from '../src/engine/rng';
import { makeMember } from '../src/game/state';

const plain = TERRAIN.grass!;

function party() {
  return [makeMember('chaogai'), makeMember('wuyong'), makeMember('liutang'), makeMember('shijin')];
}

function newBattle(seed = 1) {
  return new Battle(BATTLES.shijiacun, party(), { shangyao: 3 }, mulberry32(seed));
}

function fighter(cls: Parameters<typeof statsAt>[0], level: number) {
  const s = statsAt(cls, level);
  return { cls, level, exp: 0, maxHp: s.hp, ...s };
}

describe('攻击范围', () => {
  it('十字、菱形、方圈', () => {
    expect(inRange({ kind: 'cross', min: 1, max: 2 }, 0, 2)).toBe(true);
    expect(inRange({ kind: 'cross', min: 1, max: 2 }, 1, 1)).toBe(false);
    expect(inRange({ kind: 'diamond', min: 2, max: 3 }, 1, 0)).toBe(false);
    expect(inRange({ kind: 'diamond', min: 2, max: 3 }, 1, 1)).toBe(true);
    expect(inRange({ kind: 'square', min: 1, max: 1 }, 1, 1)).toBe(true);
    expect(inRange({ kind: 'square', min: 1, max: 1 }, 0, 0)).toBe(false);
  });
});

describe('相克与伤害', () => {
  it('枪术师克渔人（攻略）', () => {
    expect(counterMult(CLASSES.qiangshushi, CLASSES.yuren)).toBe(1.5);
    expect(counterMult(CLASSES.yuren, CLASSES.qiangshushi)).toBe(1);
  });

  it('刺客克枪、炮、弓（攻略）', () => {
    for (const c of ['qiangshushi', 'paoshou', 'gongjianshou'] as const) expect(counterMult(CLASSES.cike, CLASSES[c])).toBe(1.5);
  });

  it('卧龙打卧龙以外都有加成', () => {
    expect(counterMult(CLASSES.wolong, CLASSES.daoke)).toBeGreaterThan(1);
    expect(counterMult(CLASSES.wolong, CLASSES.wolong)).toBe(1);
  });

  it('渔人抵抗一半法术伤害（攻略）', () => {
    const mage = fighter('ceshi', 5);
    const fisher = fighter('yuren', 5);
    const blade = fighter('daoke', 5);
    const vsFisher = calcStrike(mage, { ...fisher, def: blade.def }, plain);
    const vsBlade = calcStrike(mage, blade, plain);
    expect(vsFisher.resisted).toBe(true);
    expect(vsFisher.dmg).toBeLessThan(vsBlade.dmg * 0.6);
  });

  it('树林提高防御和闪避', () => {
    const a = fighter('daoke', 5);
    const d = fighter('quanshi', 5);
    const open = calcStrike(a, d, plain);
    const forest = calcStrike(a, d, TERRAIN.tree!);
    expect(forest.dmg).toBeLessThan(open.dmg);
    expect(forest.hit).toBeLessThan(open.hit);
  });
});

describe('升级与转职', () => {
  it('满 100 经验升一级，属性增长', () => {
    const m = { ...makeMember('chaogai'), maxHp: 0 };
    const before = { ...m };
    const ups = gainExp(m, 130, mulberry32(3));
    expect(ups).toHaveLength(1);
    expect(m.level).toBe(before.level + 1);
    expect(m.exp).toBe(30);
    expect(m.hp).toBeGreaterThan(before.hp);
  });

  it('刀客 13 级转职为大刀师（攻略）', () => {
    const m = { ...makeMember("chaogai", 12), maxHp: 0 };
    const ups = gainExp(m, 100, mulberry32(4));
    expect(ups[0].promotedTo).toBe('dadaoshi');
    expect(m.cls).toBe('dadaoshi');
  });

  it('拳师 19 级转职为气功师（攻略）', () => {
    const m = { ...makeMember('liutang', 18), maxHp: 0 };
    gainExp(m, 100, mulberry32(5));
    expect(m.cls).toBe('qigongshi');
  });
});

describe('史家村之战', () => {
  it('地图每行一样宽，出场位置都在可走的格子上', () => {
    const def = BATTLES.shijiacun;
    for (const row of def.rows) expect([...row]).toHaveLength(def.rows[0].length);
    const b = newBattle();
    for (const u of b.units) {
      expect(b.terrain(u.x, u.y), `${u.name} (${u.x},${u.y})`).not.toBeNull();
      if (!CLASSES[u.cls].water) expect(b.terrain(u.x, u.y)?.water).toBeFalsy();
    }
    const spots = new Set(b.units.map((u) => `${u.x},${u.y}`));
    expect(spots.size).toBe(b.units.length);
  });

  it('晁盖和史进站在指定位置，李逵是首领', () => {
    const b = newBattle();
    const chaogai = b.units.find((u) => u.charId === 'chaogai')!;
    expect([chaogai.x, chaogai.y]).toEqual([9, 12]);
    expect(chaogai.leader).toBe(true);
    const likui = b.units.find((u) => u.charId === 'likui')!;
    expect(likui.boss).toBe(true);
    expect(likui.maxHp).toBeGreaterThan(statsAt('daoke', 5).hp);
  });

  it('移动范围不穿过敌人、不停在别人身上，陆地单位不能下水', () => {
    const b = newBattle();
    for (const u of b.units) {
      const tiles = b.reach(u).tiles;
      for (const t of tiles) {
        const o = b.unitAt(t.x, t.y);
        expect(o === null || o === u).toBe(true);
        if (!CLASSES[u.cls].water) expect(b.terrain(t.x, t.y)?.water).toBeFalsy();
      }
    }
  });

  it('击败李逵就胜利，晁盖倒下就失败', () => {
    const b = newBattle();
    expect(b.outcome()).toBeNull();
    const likui = b.units.find((u) => u.charId === 'likui')!;
    likui.alive = false;
    expect(b.outcome()).toBe('win');
    likui.alive = true;
    b.units.find((u) => u.leader)!.alive = false;
    expect(b.outcome()).toBe('lose');
  });

  it('攻击会扣血、给经验，被打死的单位移出战场', () => {
    const b = newBattle(7);
    const shijin = b.units.find((u) => u.charId === 'shijin')!;
    const fisher = b.units.find((u) => u.charId === 'bandit_fisher')!;
    b.move(shijin, fisher.x - 1, fisher.y);
    fisher.hp = 1;
    shijin.hit = 1000;
    const res = b.attack(shijin, fisher);
    expect(res.defeated).toContain(fisher.uid);
    expect(fisher.alive).toBe(false);
    expect(res.exp[0].uid).toBe(shijin.uid);
    expect(res.exp[0].amount).toBeGreaterThan(20);
  });

  it('战后等级经验写回队伍，饰品加成不会算进本身属性', () => {
    const members = party();
    members[0].accessory = 'gongshuzhinan';
    const baseHit = members[0].hit;
    const b = new Battle(BATTLES.shijiacun, members, {}, mulberry32(9));
    const chaogai = b.units.find((u) => u.charId === 'chaogai')!;
    expect(chaogai.hit).toBe(baseHit + 10);
    gainExp(chaogai, 100, mulberry32(1));
    b.syncParty();
    expect(members[0].level).toBe(5);
    expect(members[0].hit).toBe(chaogai.hit - 10);
  });

  it('李逵在有人靠近前原地不动', () => {
    const b = newBattle();
    const likui = b.units.find((u) => u.charId === 'likui')!;
    const plan = planEnemy(b, likui);
    expect(plan.path.at(-1)).toEqual({ x: 9, y: 1 });
    expect(plan.target).toBeNull();
  });

  it('敌军 AI 的路线都合法', () => {
    const b = newBattle(11);
    for (const u of b.units.filter((x) => x.side === 'enemy')) {
      const plan = planEnemy(b, u);
      const end = plan.path.at(-1)!;
      expect(b.reach(u).tiles).toContainEqual(end);
      if (plan.target) expect(b.targetsFrom(u, end.x, end.y)).toContain(plan.target);
    }
  });
});

/** 双方都用 AI 自动打一整场（我方谨慎一些，主将不乱冲），返回结果。 */
function autoplay(seed: number) {
  const b = newBattle(seed);
  const act = (u: BattleUnit) => {
    if (!u.alive) return;
    const plan = planEnemy(b, u, u.side === 'player' ? (u.leader ? 3 : 1) : 0);
    const end = plan.path.at(-1)!;
    b.move(u, end.x, end.y);
    if (plan.target?.alive) b.attack(u, plan.target);
    u.acted = true;
  };
  for (let turn = 0; turn < 40; turn++) {
    for (const u of b.units.filter((x) => x.side === 'player')) {
      act(u);
      if (b.outcome()) return b.outcome();
    }
    b.beginPhase('enemy');
    for (const u of b.units.filter((x) => x.side === 'enemy')) {
      act(u);
      if (b.outcome()) return b.outcome();
    }
    b.beginPhase('player');
  }
  return 'timeout';
}

describe('第一战难度', () => {
  it('我方交给 AI 自动打也能赢下一半以上（玩家会用伤药、占地形，会更容易）', () => {
    const results = Array.from({ length: 200 }, (_, i) => autoplay(i + 1));
    const wins = results.filter((r) => r === 'win').length;
    const timeouts = results.filter((r) => r === 'timeout').length;
    console.log(`自动对战 200 场：胜 ${wins}，负 ${results.filter((r) => r === 'lose').length}，超时 ${timeouts}`);
    expect(timeouts).toBe(0);
    expect(wins).toBeGreaterThan(110);
    expect(wins).toBeLessThan(200);
  });
});
