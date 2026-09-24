// 开发用：把所有人物的行走图（四个方向）和对话头像放大显示，方便检查美术。
// 运行 npm run dev，然后打开 /tools/viewer/sprites.html
import { charSprite, type Facing } from '../../src/art/characters';
import { portrait } from '../../src/art/portraits';
import { CHARS, NPC_LOOKS, lookOf } from '../../src/data/characters';

const app = document.getElementById('app')!;
const ids = [...Object.keys(CHARS), ...Object.keys(NPC_LOOKS)];
const facings: Facing[] = ['down', 'left', 'right', 'up'];
const frames = [0, 1, 2];
for (const id of ids) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  const scale = 4;
  c.width = 16 * facings.length * scale + (facings.length - 1) * 4;
  c.height = (16 * scale + 4) * frames.length;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  frames.forEach((fr, j) => facings.forEach((f, i) => ctx.drawImage(charSprite(lookOf(id), f, fr), i * (16 * scale + 4), j * (16 * scale + 4), 16 * scale, 16 * scale)));
  const p = document.createElement('canvas');
  p.width = 48 * 3;
  p.height = 48 * 3;
  const pc = p.getContext('2d')!;
  pc.imageSmoothingEnabled = false;
  pc.fillStyle = '#1a2250';
  pc.fillRect(0, 0, p.width, p.height);
  pc.drawImage(portrait(lookOf(id)), 0, 0, p.width, p.height);
  fig.append(p, c, CHARS[id]?.name ?? id);
  app.append(fig);
}
