// 简单的战斗 AI：能打到人就挑收益最高的目标打，打不到就往最近的对手靠。
// caution（谨慎度）越高越不愿意站到很多对手能打到的格子上；敌方喽啰默认不怕死。
import { CLASSES } from '../data/classes';
import { flood, type Pt } from '../engine/path';
import { inRange } from './rules';
import type { Battle, BattleUnit } from './battle';

export interface AiPlan {
  path: Pt[];
  target: BattleUnit | null;
}

/** 驻守的单位：有人进入它下回合能打到的距离、或者它受了伤，就开始出击。 */
function shouldWake(b: Battle, u: BattleUnit) {
  if (u.hp < u.maxHp) return true;
  const cls = CLASSES[u.cls];
  return b.foesOf(u).some((f) => Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= cls.mov + cls.range.max + 1);
}

/** 对 side 这一方来说，每个格子下回合会被几个对手打到（驻守没醒的不算）。 */
export function threatMap(b: Battle, side: 'player' | 'enemy'): Uint8Array {
  const map = new Uint8Array(b.w * b.h);
  for (const f of b.living) {
    if (f.side === side) continue;
    const range = CLASSES[f.cls].range;
    const origins = f.ai === 'hold' ? [{ x: f.x, y: f.y }] : b.reach(f).tiles;
    const hit = new Uint8Array(b.w * b.h);
    for (const o of origins) {
      for (let dy = -range.max; dy <= range.max; dy++) {
        for (let dx = -range.max; dx <= range.max; dx++) {
          const x = o.x + dx;
          const y = o.y + dy;
          if (b.inBounds(x, y) && inRange(range, dx, dy)) hit[y * b.w + x] = 1;
        }
      }
    }
    for (let i = 0; i < map.length; i++) map[i] += hit[i];
  }
  return map;
}

export function planEnemy(b: Battle, u: BattleUnit, caution = 0): AiPlan {
  const stay: AiPlan = { path: [{ x: u.x, y: u.y }], target: null };
  const foes = b.foesOf(u);
  if (!foes.length) return stay;
  if (u.ai === 'hold' && shouldWake(b, u)) u.ai = 'aggressive';
  const holding = u.ai === 'hold';

  const reach = b.reach(u);
  const tiles = holding ? [{ x: u.x, y: u.y }] : reach.tiles;
  const threat = caution > 0 ? threatMap(b, u.side) : null;
  const risk = (t: Pt) => (threat ? Math.max(0, threat[t.y * b.w + t.x] - 1) * caution * 12 : 0);
  let best: { score: number; tile: Pt; target: BattleUnit } | null = null;
  for (const tile of tiles) {
    const terr = b.terrain(tile.x, tile.y);
    const stepCost = reach.nodes.get(tile.y * b.w + tile.x)?.cost ?? 0;
    for (const target of b.targetsFrom(u, tile.x, tile.y)) {
      const fc = b.forecast(u, target, tile.x, tile.y);
      const p = fc.strike.hit / 100;
      const kills = fc.strike.dmg >= target.hp;
      const counter = fc.counter && !kills ? (fc.counter.dmg * fc.counter.hit) / 100 : 0;
      const score =
        Math.min(target.hp, fc.strike.dmg) * p +
        (kills ? 40 * p : 0) +
        (target.leader ? 8 : 0) +
        (target.boss ? 8 : 0) -
        counter * (0.5 + caution * 0.5) +
        (terr?.def ?? 0) * 20 +
        (terr?.eva ?? 0) * 0.3 -
        stepCost * 0.1 -
        risk(tile);
      if (!best || score > best.score) best = { score, tile, target };
    }
  }
  if (best && (caution === 0 || best.score > 0)) return { path: b.pathTo(reach, best.tile.x, best.tile.y), target: best.target };
  if (holding) return stay;

  // 打不到人：按这个职业的走法算出到最近对手的距离，往距离最小的格子走
  const field = flood(b.w, b.h, foes, (x, y) => b.terrainCost(u.cls, x, y), b.w * b.h * 3);
  const value = (t: Pt) => (field.get(t.y * b.w + t.x)?.cost ?? 99) + risk(t) / 6 - (b.terrain(t.x, t.y)?.def ?? 0);
  let goal: Pt = { x: u.x, y: u.y };
  for (const t of tiles) if (value(t) < value(goal)) goal = t;
  return { path: b.pathTo(reach, goal.x, goal.y), target: null };
}
