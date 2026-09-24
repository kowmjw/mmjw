import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import { parseRows, walkable } from '../src/data/terrain';
import { findPath } from '../src/engine/path';
import { EVENTS } from '../src/story/chapter1';

describe('探索地图数据', () => {
  for (const map of Object.values(MAPS)) {
    describe(map.name + `（${map.id}）`, () => {
      const tiles = parseRows(map.rows);
      const w = map.rows[0].length;
      const h = map.rows.length;
      const at = (x: number, y: number) => tiles[y]?.[x];

      it('每行一样宽', () => {
        map.rows.forEach((row, y) => expect([...row].length, `第 ${y} 行`).toBe(w));
      });

      it('人物站在能走的格子上，互不重叠', () => {
        const seen = new Set<string>();
        for (const n of map.npcs) {
          expect(walkable(at(n.x, n.y)), `${n.id} (${n.x},${n.y}) 是 ${at(n.x, n.y)}`).toBe(true);
          expect(seen.has(`${n.x},${n.y}`)).toBe(false);
          seen.add(`${n.x},${n.y}`);
          expect(EVENTS[n.talk], `缺少对话事件 ${n.talk}`).toBeTypeOf('function');
        }
      });

      it('传送点在门上，落点能走，并且能走回来', () => {
        for (const wp of map.warps) {
          expect(['door', 'exit']).toContain(at(wp.x, wp.y));
          const dest = MAPS[wp.to];
          expect(dest, `目标地图 ${wp.to}`).toBeDefined();
          const dt = parseRows(dest.rows);
          expect(walkable(dt[wp.ty][wp.tx]), `${wp.to} (${wp.tx},${wp.ty})`).toBe(true);
          expect(dest.warps.some((b) => b.to === map.id), `${wp.to} 没有回到 ${map.id} 的出口`).toBe(true);
        }
      });

      it('可调查的东西在界内，触发区域的事件存在', () => {
        for (const o of map.objects) expect(at(o.x, o.y)).toBeDefined();
        for (const t of map.triggers) {
          expect(at(t.x, t.y)).toBeDefined();
          expect(EVENTS[t.event]).toBeTypeOf('function');
        }
        if (map.onEnter) expect(EVENTS[map.onEnter]).toBeTypeOf('function');
      });

      it('从每个传送落点都能走到所有人物身边和所有门', () => {
        const blocked = new Set(map.npcs.map((n) => `${n.x},${n.y}`));
        const pass = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && walkable(at(x, y)) && !blocked.has(`${x},${y}`);
        const starts = Object.values(MAPS).flatMap((m) => m.warps.filter((wp) => wp.to === map.id).map((wp) => ({ x: wp.tx, y: wp.ty })));
        const goals = [...map.warps.map((wp) => ({ x: wp.x, y: wp.y })), ...map.npcs.map((n) => ({ x: n.x, y: n.y }))];
        for (const s of starts) {
          for (const g of goals) expect(findPath(w, h, s, g, pass), `(${s.x},${s.y}) → (${g.x},${g.y})`).not.toBeNull();
        }
      });
    });
  }
});
