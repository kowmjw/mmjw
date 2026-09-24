export interface Pt {
  x: number;
  y: number;
}

export const DIRS4: readonly Pt[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export interface FloodNode {
  cost: number;
  prev: number;
}

/**
 * 从起点（可以是多个）按地形消耗扩散（Dijkstra），返回 maxCost 以内能到的格子。
 * cost 返回 Infinity 表示过不去。结果的 key 是 y * w + x。
 */
export function flood(w: number, h: number, start: Pt | readonly Pt[], cost: (x: number, y: number) => number, maxCost: number) {
  const out = new Map<number, FloodNode>();
  const open: number[] = [];
  for (const s of Array.isArray(start) ? start : [start as Pt]) {
    const k = s.y * w + s.x;
    if (out.has(k)) continue;
    out.set(k, { cost: 0, prev: -1 });
    open.push(k);
  }
  while (open.length) {
    // 格子很少（几百个），直接找最小值就够了
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (out.get(open[i])!.cost < out.get(open[bi])!.cost) bi = i;
    const k = open.splice(bi, 1)[0];
    const cur = out.get(k)!;
    const x = k % w;
    const y = (k - x) / w;
    for (const d of DIRS4) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = cost(nx, ny);
      if (!Number.isFinite(c)) continue;
      const nc = cur.cost + c;
      if (nc > maxCost) continue;
      const nk = ny * w + nx;
      const old = out.get(nk);
      if (old && old.cost <= nc) continue;
      out.set(nk, { cost: nc, prev: k });
      if (!old) open.push(nk);
    }
  }
  return out;
}

/** 从 flood 的结果里还原到 target 的路线（含起点和终点）。 */
export function tracePath(nodes: Map<number, FloodNode>, w: number, target: Pt): Pt[] {
  const path: Pt[] = [];
  let k = target.y * w + target.x;
  if (!nodes.has(k)) return path;
  while (k !== -1) {
    const x = k % w;
    path.push({ x, y: (k - x) / w });
    k = nodes.get(k)!.prev;
  }
  return path.reverse();
}

/** 普通寻路（每步消耗 1），走不到返回 null。 */
export function findPath(w: number, h: number, start: Pt, goal: Pt, passable: (x: number, y: number) => boolean): Pt[] | null {
  const nodes = flood(w, h, start, (x, y) => (passable(x, y) || (x === goal.x && y === goal.y) ? 1 : Infinity), w * h);
  const path = tracePath(nodes, w, goal);
  return path.length ? path : null;
}
