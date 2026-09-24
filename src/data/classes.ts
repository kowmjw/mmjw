// 职业表。职业名和转职路线来自攻略资料；属性数值、攻击范围、相克倍率大多是暂定的，
// 标「攻略」的是资料里提到过的特点，其余等拿到原版 ROM 后按原数值替换。

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  hit: number;
  eva: number;
}

export type Family =
  | 'blade'
  | 'spear'
  | 'strategist'
  | 'healer'
  | 'geomancer'
  | 'fisher'
  | 'assassin'
  | 'archer'
  | 'hermit'
  | 'boxer'
  | 'gunner'
  | 'kite'
  | 'undead';

/** cross：十字方向直线；diamond：步数距离；square：含斜角的方圈。min/max 是距离范围。 */
export interface RangeShape {
  kind: 'cross' | 'diamond' | 'square';
  min: number;
  max: number;
}

export type ClassId =
  | 'daoke'
  | 'dadaoshi'
  | 'daoshen'
  | 'ceshi'
  | 'dajunshi'
  | 'wolong'
  | 'langzhong'
  | 'shenyi'
  | 'huatuo'
  | 'qiangshushi'
  | 'qiangjiashi'
  | 'jinlouren'
  | 'fengshuishi'
  | 'yinyangshi'
  | 'dazhenren'
  | 'yuren'
  | 'shuigui'
  | 'cike'
  | 'shenxingzhe'
  | 'gongjianshou'
  | 'shensheshou'
  | 'yinshi'
  | 'zhizhe'
  | 'quanshi'
  | 'qigongshi'
  | 'paoshou'
  | 'tiepaoshou'
  | 'fengzhengren'
  | 'jiangshi';

export interface ClassDef {
  id: ClassId;
  name: string;
  family: Family;
  tier: 1 | 2 | 3;
  mov: number;
  range: RangeShape;
  magic?: boolean;
  heal?: boolean;
  water?: boolean;
  fly?: boolean;
  promote?: { to: ClassId; level: number };
  desc: string;
}

interface FamilyDef {
  base: Stats;
  growth: Stats;
  mov: number;
  range: RangeShape;
  magic?: boolean;
  heal?: boolean;
  water?: boolean;
  fly?: boolean;
}

const cross = (min: number, max: number): RangeShape => ({ kind: 'cross', min, max });
const diamond = (min: number, max: number): RangeShape => ({ kind: 'diamond', min, max });
const square = (min: number, max: number): RangeShape => ({ kind: 'square', min, max });

export const FAMILIES: Record<Family, FamilyDef> = {
  blade: { base: { hp: 60, atk: 22, def: 12, hit: 88, eva: 8 }, growth: { hp: 6, atk: 2.2, def: 1.2, hit: 0.4, eva: 0.3 }, mov: 4, range: cross(1, 1) },
  spear: { base: { hp: 64, atk: 20, def: 15, hit: 85, eva: 5 }, growth: { hp: 6.5, atk: 2, def: 1.6, hit: 0.4, eva: 0.2 }, mov: 4, range: cross(1, 2) },
  strategist: {
    base: { hp: 46, atk: 20, def: 8, hit: 95, eva: 10 },
    growth: { hp: 4.5, atk: 2.2, def: 0.8, hit: 0.3, eva: 0.4 },
    mov: 4,
    range: diamond(1, 2),
    magic: true,
  },
  healer: {
    base: { hp: 46, atk: 12, def: 8, hit: 85, eva: 10 },
    growth: { hp: 4.5, atk: 1.2, def: 0.8, hit: 0.3, eva: 0.4 },
    mov: 4,
    range: cross(1, 1),
    heal: true,
  },
  geomancer: {
    base: { hp: 46, atk: 19, def: 9, hit: 92, eva: 10 },
    growth: { hp: 4.5, atk: 2.1, def: 0.9, hit: 0.3, eva: 0.4 },
    mov: 4,
    range: diamond(1, 2),
    magic: true,
  },
  fisher: {
    base: { hp: 52, atk: 18, def: 10, hit: 85, eva: 12 },
    growth: { hp: 5.5, atk: 1.8, def: 1, hit: 0.4, eva: 0.5 },
    mov: 4,
    range: cross(1, 1), // 攻略：转职后攻击范围仍是周围四格
    water: true,
  },
  assassin: { base: { hp: 46, atk: 24, def: 7, hit: 95, eva: 20 }, growth: { hp: 4.5, atk: 2.5, def: 0.7, hit: 0.4, eva: 0.6 }, mov: 5, range: square(1, 1) },
  archer: { base: { hp: 46, atk: 20, def: 8, hit: 95, eva: 10 }, growth: { hp: 4.5, atk: 2.1, def: 0.8, hit: 0.4, eva: 0.4 }, mov: 4, range: diamond(2, 3) },
  hermit: {
    base: { hp: 50, atk: 18, def: 10, hit: 90, eva: 12 },
    growth: { hp: 5, atk: 2, def: 1, hit: 0.3, eva: 0.4 },
    mov: 4,
    range: diamond(1, 2),
    magic: true,
  },
  boxer: { base: { hp: 58, atk: 20, def: 10, hit: 90, eva: 15 }, growth: { hp: 6, atk: 2.1, def: 1, hit: 0.4, eva: 0.5 }, mov: 5, range: cross(1, 1) },
  // 攻略：铁炮手移动力差，直线最远打 4 格
  gunner: { base: { hp: 50, atk: 23, def: 11, hit: 88, eva: 12 }, growth: { hp: 5, atk: 2.3, def: 1.1, hit: 0.4, eva: 0.4 }, mov: 3, range: cross(1, 4) },
  kite: { base: { hp: 42, atk: 16, def: 7, hit: 90, eva: 18 }, growth: { hp: 4, atk: 1.8, def: 0.7, hit: 0.3, eva: 0.5 }, mov: 5, range: diamond(1, 1), fly: true },
  undead: { base: { hp: 50, atk: 18, def: 8, hit: 80, eva: 0 }, growth: { hp: 5, atk: 1.8, def: 0.8, hit: 0.3, eva: 0 }, mov: 3, range: cross(1, 1) },
};

/** 转职时一次性增加的属性（按转职后的阶级）。 */
export const PROMO_BONUS: Record<2 | 3, Stats> = {
  2: { hp: 10, atk: 3, def: 3, hit: 3, eva: 2 },
  3: { hp: 14, atk: 4, def: 4, hit: 3, eva: 3 },
};

function mk(id: ClassId, name: string, family: Family, tier: 1 | 2 | 3, desc: string, promote?: { to: ClassId; level: number }, extra: Partial<ClassDef> = {}): ClassDef {
  const f = FAMILIES[family];
  return {
    id,
    name,
    family,
    tier,
    mov: f.mov + (tier === 3 ? 1 : 0),
    range: f.range,
    magic: f.magic,
    heal: f.heal,
    water: f.water,
    fly: f.fly,
    promote,
    desc,
    ...extra,
  };
}

const LIST: ClassDef[] = [
  mk('daoke', '刀客', 'blade', 1, '使刀的步战好手，攻守平均。', { to: 'dadaoshi', level: 13 }),
  mk('dadaoshi', '大刀师', 'blade', 2, '刀法大成。', { to: 'daoshen', level: 25 }),
  mk('daoshen', '刀神', 'blade', 3, '刀客的最高境界。'),
  mk('ceshi', '策士', 'strategist', 1, '以计策远距离攻击，身体较弱。', { to: 'dajunshi', level: 13 }),
  mk('dajunshi', '大军师', 'strategist', 2, '运筹帷幄的军师。', { to: 'wolong', level: 25 }),
  mk('wolong', '卧龙', 'strategist', 3, '攻略：对卧龙以外的职业都有不错的伤害。'),
  mk('langzhong', '郎中', 'healer', 1, '能为身边的同伴疗伤。', { to: 'shenyi', level: 13 }),
  mk('shenyi', '神医', 'healer', 2, '妙手回春。', { to: 'huatuo', level: 25 }),
  mk('huatuo', '华佗', 'healer', 3, '医术通神。'),
  mk('qiangshushi', '枪术师', 'spear', 1, '攻略：克制渔人、策士、隐士、风水师、郎中，防御很高。', { to: 'qiangjiashi', level: 13 }),
  mk('qiangjiashi', '枪甲士', 'spear', 2, '披甲持枪，稳如磐石。', { to: 'jinlouren', level: 25 }),
  mk('jinlouren', '金镂人', 'spear', 3, '枪术师的最高境界。'),
  mk('fengshuishi', '风水师', 'geomancer', 1, '借天地之气施展法术。', { to: 'yinyangshi', level: 13 }),
  mk('yinyangshi', '阴阳师', 'geomancer', 2, '通晓阴阳之术。', { to: 'dazhenren', level: 25 }),
  mk('dazhenren', '大真人', 'geomancer', 3, '道法高深的真人。'),
  mk('yuren', '渔人', 'fisher', 1, '攻略：攻防不高，但能抵抗法术；能下水。', { to: 'shuigui', level: 19 }),
  mk('shuigui', '水鬼', 'fisher', 2, '水中来去自如。'),
  mk('cike', '刺客', 'assassin', 1, '攻略：克制枪术师、炮手、弓箭手，伤害高但防御差。', { to: 'shenxingzhe', level: 19 }),
  mk('shenxingzhe', '神行者', 'assassin', 2, '来无影去无踪。'),
  mk('gongjianshou', '弓箭手', 'archer', 1, '远距离射击，贴身时无法攻击。', { to: 'shensheshou', level: 19 }),
  mk('shensheshou', '神射手', 'archer', 2, '百步穿杨。'),
  mk('yinshi', '隐士', 'hermit', 1, '隐居山林的高人。', { to: 'zhizhe', level: 19 }),
  mk('zhizhe', '智者', 'hermit', 2, '洞察世事的智者。'),
  mk('quanshi', '拳师', 'boxer', 1, '赤手空拳，身手敏捷。', { to: 'qigongshi', level: 19 }),
  mk('qigongshi', '气功师', 'boxer', 2, '攻略：血厚、攻击最高，命中闪避都好，打什么职业都行。'),
  mk('paoshou', '炮手', 'gunner', 1, '攻略：移动力差，直线最远打 4 格。', { to: 'tiepaoshou', level: 19 }),
  mk('tiepaoshou', '铁炮手', 'gunner', 2, '火器精通。'),
  mk('fengzhengren', '风筝人', 'kite', 1, '乘风筝飞行，无视地形（暂定）。'),
  mk('jiangshi', '僵尸', 'undead', 1, '百花谷的不死之物。'),
];

export const CLASSES = Object.fromEntries(LIST.map((c) => [c.id, c])) as Record<ClassId, ClassDef>;

/** 某职业某等级的标准属性（敌人、刚加入的同伴用）。 */
export function statsAt(id: ClassId, level: number): Stats {
  const cls = CLASSES[id];
  const f = FAMILIES[cls.family];
  const out = { ...f.base };
  for (const k of Object.keys(out) as (keyof Stats)[]) {
    out[k] = Math.round(f.base[k] + f.growth[k] * (level - 1));
    if (cls.tier >= 2) out[k] += PROMO_BONUS[2][k];
    if (cls.tier >= 3) out[k] += PROMO_BONUS[3][k];
  }
  return out;
}

/** 这个职业下一次转职：转成什么、几级。 */
export function nextPromotion(id: ClassId) {
  const p = CLASSES[id].promote;
  return p ? { name: CLASSES[p.to].name, level: p.level } : null;
}
