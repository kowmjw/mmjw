// 用马善政毛笔字的轮廓画大字（标题、章节名、回合横幅）。
import { BRUSH_GLYPHS } from './brushGlyphs';

const paths = new Map<string, Path2D>();

function glyphPath(ch: string) {
  let p = paths.get(ch);
  if (!p) {
    const g = BRUSH_GLYPHS[ch];
    if (!g) return null;
    paths.set(ch, (p = new Path2D(g.d)));
  }
  return p;
}

export interface BrushOpts {
  /** 填充：颜色，或者一张纹理图（按屏幕坐标铺满字形） */
  fill: string | HTMLCanvasElement;
  /** 纹理图在屏幕上的左上角 */
  fillAt?: { x: number; y: number };
  outline?: string;
  outlineWidth?: number;
  shadow?: { dx: number; dy: number; color: string };
  /** 字距（相对字号） */
  spacing?: number;
  /** 每个字额外的上下偏移 */
  offsets?: number[];
}

export function brushWidth(text: string, size: number, spacing = 1) {
  let w = 0;
  for (const ch of text) w += ((BRUSH_GLYPHS[ch]?.adv ?? 1000) / 1000) * size * spacing;
  return w;
}

/** 在 (x, y) 画一行毛笔字，y 是字身框顶部。 */
export function drawBrush(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts: BrushOpts) {
  const s = size / 1000;
  const spacing = opts.spacing ?? 1;
  let i = 0;
  for (const ch of text) {
    const oy = y + (opts.offsets?.[i] ?? 0);
    const path = glyphPath(ch);
    if (!path) {
      // 没提取到的字退回系统字体
      ctx.font = `bold ${size * 0.8}px serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = typeof opts.fill === 'string' ? opts.fill : '#fff';
      ctx.fillText(ch, x, oy + size * 0.1);
      x += size * spacing;
      i++;
      continue;
    }
    const base = ctx.getTransform();
    const place = () => {
      ctx.setTransform(base);
      ctx.translate(x, oy);
      ctx.scale(s, s);
    };
    ctx.save();
    ctx.lineJoin = 'round';
    if (opts.shadow) {
      place();
      ctx.translate(opts.shadow.dx / s, opts.shadow.dy / s);
      ctx.fillStyle = opts.shadow.color;
      ctx.strokeStyle = opts.shadow.color;
      ctx.lineWidth = (opts.outlineWidth ?? 0) / s;
      if (opts.outlineWidth) ctx.stroke(path);
      ctx.fill(path);
    }
    if (opts.outline && opts.outlineWidth) {
      place();
      ctx.strokeStyle = opts.outline;
      ctx.lineWidth = opts.outlineWidth / s;
      ctx.stroke(path);
    }
    place();
    if (typeof opts.fill === 'string') {
      ctx.fillStyle = opts.fill;
      ctx.fill(path);
    } else {
      ctx.clip(path);
      ctx.setTransform(base);
      const at = opts.fillAt ?? { x: 0, y: 0 };
      ctx.drawImage(opts.fill, at.x, at.y);
    }
    ctx.restore();
    x += ((BRUSH_GLYPHS[ch]?.adv ?? 1000) / 1000) * size * spacing;
    i++;
  }
}
