// 地图图块（16×16），用代码画的临时美术，以后换成原版 ROM 里的图块。
import { ctx2d, makeCanvas } from '../engine/pixel';
import { hash2 } from '../engine/rng';
import type { TileKind } from '../data/terrain';

export const TILE = 16;

type Ctx = CanvasRenderingContext2D;

const GRASS = '#5a9a3a';
const GRASS_D = '#4a8430';
const GRASS_L = '#74b24c';
const ROAD = '#c8a870';
const ROAD_D = '#b0905a';
const ROAD_L = '#dcbe88';

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function speckle(ctx: Ctx, ox: number, oy: number, tx: number, ty: number, seed: number, n: number, colors: string[]) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(tx * 7 + i, ty * 13, seed) * TILE);
    const y = Math.floor(hash2(tx * 11, ty * 5 + i, seed + 1) * TILE);
    px(ctx, ox + x, oy + y, 1, 1, colors[i % colors.length]);
  }
}

function grass(ctx: Ctx, ox: number, oy: number, tx: number, ty: number) {
  px(ctx, ox, oy, TILE, TILE, GRASS);
  speckle(ctx, ox, oy, tx, ty, 1, 7, [GRASS_D, GRASS_L, GRASS_D]);
  if (hash2(tx, ty, 9) < 0.35) {
    const x = ox + 3 + Math.floor(hash2(tx, ty, 10) * 9);
    const y = oy + 4 + Math.floor(hash2(tx, ty, 11) * 8);
    px(ctx, x, y, 1, 2, GRASS_D);
    px(ctx, x + 2, y + 1, 1, 2, GRASS_D);
  }
}

function road(ctx: Ctx, ox: number, oy: number, tx: number, ty: number, base = ROAD) {
  px(ctx, ox, oy, TILE, TILE, base);
  speckle(ctx, ox, oy, tx, ty, 3, 6, [ROAD_D, ROAD_L, '#a09080']);
}

type Neighbor = (dx: number, dy: number) => TileKind | null;

export function drawTile(ctx: Ctx, kind: TileKind, ox: number, oy: number, tx: number, ty: number, nb: Neighbor) {
  switch (kind) {
    case 'grass':
      grass(ctx, ox, oy, tx, ty);
      break;
    case 'flowers': {
      grass(ctx, ox, oy, tx, ty);
      const colors = ['#f05050', '#f8e060', '#ffffff', '#f080c0'];
      for (let i = 0; i < 5; i++) {
        const x = 2 + Math.floor(hash2(tx + i, ty, 21) * 12);
        const y = 2 + Math.floor(hash2(tx, ty + i, 22) * 12);
        px(ctx, ox + x, oy + y, 2, 2, colors[i % 4]);
        px(ctx, ox + x, oy + y + 2, 1, 1, GRASS_D);
      }
      break;
    }
    case 'road':
      road(ctx, ox, oy, tx, ty);
      break;
    case 'courtyard':
      px(ctx, ox, oy, TILE, TILE, '#b8b0a0');
      px(ctx, ox, oy + 7, TILE, 1, '#9a9282');
      px(ctx, ox, oy + 15, TILE, 1, '#9a9282');
      px(ctx, ox + ((ty % 2) * 8 + 3), oy, 1, 7, '#9a9282');
      px(ctx, ox + ((ty % 2) * 8 + 11) % 16, oy + 8, 1, 7, '#9a9282');
      break;
    case 'gate':
      road(ctx, ox, oy, tx, ty, '#b8b0a0');
      px(ctx, ox, oy, 2, TILE, '#a83a2a');
      px(ctx, ox + 14, oy, 2, TILE, '#a83a2a');
      break;
    case 'tree': {
      grass(ctx, ox, oy, tx, ty);
      px(ctx, ox + 7, oy + 11, 2, 5, '#6a4424');
      ctx.fillStyle = '#23561f';
      ctx.beginPath();
      ctx.arc(ox + 8, oy + 7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#35803a';
      ctx.beginPath();
      ctx.arc(ox + 8, oy + 6.5, 5.6, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, ox + 5, oy + 3, 3, 2, '#5aa84c');
      px(ctx, ox + 4, oy + 5, 2, 1, '#5aa84c');
      speckle(ctx, ox + 2, oy + 2, tx, ty, 5, 4, ['#23561f']);
      break;
    }
    case 'water': {
      px(ctx, ox, oy, TILE, TILE, '#3a6ac8');
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(hash2(tx + i, ty, 31) * 12);
        const y = 2 + i * 5;
        px(ctx, ox + x, oy + y, 4, 1, '#7aa6f0');
      }
      if (nb(-1, 0) && nb(-1, 0) !== 'water' && nb(-1, 0) !== 'bridge') px(ctx, ox, oy, 1, TILE, '#b8d4ff');
      if (nb(1, 0) && nb(1, 0) !== 'water' && nb(1, 0) !== 'bridge') px(ctx, ox + 15, oy, 1, TILE, '#b8d4ff');
      break;
    }
    case 'bridge':
      px(ctx, ox, oy, TILE, TILE, '#a87a48');
      for (let x = 0; x < TILE; x += 4) px(ctx, ox + x, oy + 1, 1, 14, '#7a5230');
      px(ctx, ox, oy, TILE, 2, '#6a4424');
      px(ctx, ox, oy + 14, TILE, 2, '#6a4424');
      break;
    case 'fence':
      grass(ctx, ox, oy, tx, ty);
      px(ctx, ox, oy + 6, TILE, 2, '#9a6a3a');
      px(ctx, ox, oy + 11, TILE, 2, '#9a6a3a');
      px(ctx, ox + 2, oy + 3, 2, 12, '#7a4a22');
      px(ctx, ox + 12, oy + 3, 2, 12, '#7a4a22');
      break;
    case 'crops':
      px(ctx, ox, oy, TILE, TILE, '#8a6a34');
      for (let y = 1; y < TILE; y += 5) {
        px(ctx, ox, oy + y + 3, TILE, 1, '#6a4e24');
        for (let x = 1; x < TILE; x += 3) {
          px(ctx, ox + x, oy + y, 1, 3, '#9ac040');
          px(ctx, ox + x, oy + y, 1, 1, '#e0d060');
        }
      }
      break;
    case 'rock':
      grass(ctx, ox, oy, tx, ty);
      px(ctx, ox + 2, oy + 5, 12, 9, '#6a6a6a');
      px(ctx, ox + 3, oy + 4, 10, 1, '#6a6a6a');
      px(ctx, ox + 3, oy + 5, 8, 3, '#9a9a9a');
      px(ctx, ox + 2, oy + 13, 12, 1, '#4a4a4a');
      break;
    case 'roof': {
      const top = nb(0, -1) !== 'roof';
      const bottom = nb(0, 1) !== 'roof';
      px(ctx, ox, oy, TILE, TILE, '#4c5c80');
      for (let y = 0; y < TILE; y += 4) {
        px(ctx, ox, oy + y + 3, TILE, 1, '#35425e');
        const off = (y / 4 + ty) % 2 ? 0 : 4;
        for (let x = off; x < TILE; x += 8) px(ctx, ox + x, oy + y, 1, 3, '#3c4a6a');
      }
      if (top) {
        px(ctx, ox, oy, TILE, 3, '#7a88a8');
        px(ctx, ox, oy + 3, TILE, 1, '#2a3450');
      }
      if (bottom) px(ctx, ox, oy + 13, TILE, 3, '#252c40');
      if (nb(-1, 0) !== 'roof') px(ctx, ox, oy, 1, TILE, '#2a3450');
      if (nb(1, 0) !== 'roof') px(ctx, ox + 15, oy, 1, TILE, '#2a3450');
      break;
    }
    case 'wall':
    case 'door':
    case 'shutdoor': {
      px(ctx, ox, oy, TILE, TILE, '#e8dcbc');
      px(ctx, ox, oy + 13, TILE, 3, '#9a8a6a');
      px(ctx, ox, oy, TILE, 1, '#b8a888');
      if (nb(-1, 0) !== 'wall' && nb(-1, 0) !== 'door' && nb(-1, 0) !== 'shutdoor') px(ctx, ox, oy, 2, TILE, '#7a5a3a');
      if (nb(1, 0) !== 'wall' && nb(1, 0) !== 'door' && nb(1, 0) !== 'shutdoor') px(ctx, ox + 14, oy, 2, TILE, '#7a5a3a');
      if (kind === 'wall') {
        if (hash2(tx, ty, 41) < 0.6) {
          px(ctx, ox + 4, oy + 3, 8, 7, '#5a3a22');
          px(ctx, ox + 5, oy + 4, 6, 5, '#e8d8a8');
          px(ctx, ox + 7, oy + 4, 1, 5, '#5a3a22');
          px(ctx, ox + 5, oy + 6, 6, 1, '#5a3a22');
        }
      } else {
        px(ctx, ox + 3, oy + 2, 10, 14, '#4a2a14');
        px(ctx, ox + 4, oy + 3, 8, 13, kind === 'door' ? '#8a5226' : '#6a3e1c');
        px(ctx, ox + 7, oy + 3, 2, 13, '#4a2a14');
        px(ctx, ox + 6, oy + 9, 1, 2, '#e0c060');
        px(ctx, ox + 9, oy + 9, 1, 2, '#e0c060');
      }
      break;
    }
    case 'stonewall':
      px(ctx, ox, oy, TILE, TILE, '#9a968c');
      for (let y = 0; y < TILE; y += 4) {
        px(ctx, ox, oy + y + 3, TILE, 1, '#6a665c');
        const off = (y / 4 + tx) % 2 ? 2 : 6;
        for (let x = off; x < TILE; x += 8) px(ctx, ox + x, oy + y, 1, 3, '#6a665c');
      }
      px(ctx, ox, oy, TILE, 1, '#c8c4b8');
      break;
    case 'hay':
      grass(ctx, ox, oy, tx, ty);
      ctx.fillStyle = '#b89030';
      ctx.beginPath();
      ctx.ellipse(ox + 8, oy + 10, 7, 6, 0, Math.PI, 0);
      ctx.fill();
      px(ctx, ox + 1, oy + 10, 14, 4, '#b89030');
      px(ctx, ox + 3, oy + 6, 10, 2, '#e0c050');
      px(ctx, ox + 2, oy + 13, 12, 1, '#7a5a18');
      break;
    case 'well':
      grass(ctx, ox, oy, tx, ty);
      px(ctx, ox + 2, oy + 4, 12, 10, '#8a8a8a');
      px(ctx, ox + 4, oy + 6, 8, 5, '#1a2a5a');
      px(ctx, ox + 2, oy + 4, 12, 1, '#c0c0c0');
      px(ctx, ox + 2, oy + 13, 12, 1, '#5a5a5a');
      break;
    case 'floor':
    case 'exit':
      px(ctx, ox, oy, TILE, TILE, '#b88a52');
      for (let y = 3; y < TILE; y += 4) px(ctx, ox, oy + y, TILE, 1, '#9a6e3c');
      px(ctx, ox + ((ty * 5) % 16), oy, 1, 3, '#9a6e3c');
      if (kind === 'exit') {
        px(ctx, ox + 2, oy + 4, 12, 10, '#a83a2a');
        px(ctx, ox + 3, oy + 5, 10, 8, '#c85a3a');
      }
      break;
    case 'iwall':
      px(ctx, ox, oy, TILE, TILE, '#6a4a34');
      px(ctx, ox, oy + 12, TILE, 4, '#4a3020');
      px(ctx, ox + 1, oy + 2, 14, 8, '#8a6a4a');
      break;
    case 'cabinet':
      px(ctx, ox, oy, TILE, TILE, '#b88a52');
      px(ctx, ox + 1, oy, 14, 15, '#5a3218');
      px(ctx, ox + 2, oy + 1, 12, 6, '#7a4a24');
      px(ctx, ox + 2, oy + 8, 12, 6, '#7a4a24');
      px(ctx, ox + 7, oy + 3, 2, 1, '#e0c060');
      px(ctx, ox + 7, oy + 10, 2, 1, '#e0c060');
      break;
    case 'jar':
      px(ctx, ox, oy, TILE, TILE, '#b88a52');
      ctx.fillStyle = '#7a4a2a';
      ctx.beginPath();
      ctx.ellipse(ox + 8, oy + 9, 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, ox + 5, oy + 2, 6, 2, '#5a3218');
      px(ctx, ox + 5, oy + 7, 2, 3, '#a06a3a');
      break;
    case 'bed':
      px(ctx, ox, oy, TILE, TILE, '#b88a52');
      px(ctx, ox + 1, oy + 1, 14, 14, '#6a3a1a');
      px(ctx, ox + 2, oy + 2, 12, 4, '#f0ece0');
      px(ctx, ox + 2, oy + 6, 12, 8, '#5a78b8');
      break;
    case 'table':
      px(ctx, ox, oy, TILE, TILE, '#b88a52');
      px(ctx, ox + 1, oy + 4, 14, 8, '#7a4a22');
      px(ctx, ox + 1, oy + 4, 14, 2, '#9a6a3a');
      px(ctx, ox + 2, oy + 12, 2, 3, '#5a3218');
      px(ctx, ox + 12, oy + 12, 2, 3, '#5a3218');
      break;
    case 'void':
      px(ctx, ox, oy, TILE, TILE, '#000');
      break;
  }
}

/** 把整张地图预先画到一张离屏画布上。 */
export function renderMap(tiles: TileKind[][]): HTMLCanvasElement {
  const h = tiles.length;
  const w = tiles[0].length;
  const c = makeCanvas(w * TILE, h * TILE);
  const ctx = ctx2d(c);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nb: Neighbor = (dx, dy) => tiles[y + dy]?.[x + dx] ?? null;
      drawTile(ctx, tiles[y][x], x * TILE, y * TILE, x, y, nb);
    }
  }
  return c;
}
