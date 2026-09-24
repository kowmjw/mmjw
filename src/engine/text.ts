const FAMILY =
  '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif';

export function font(size: number, bold = false) {
  return `${bold ? 'bold ' : ''}${size}px ${FAMILY}`;
}

export interface TextOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  align?: CanvasTextAlign;
  /** 文字阴影颜色，false 表示不要阴影 */
  shadow?: string | false;
}

/** 画一行字（y 是文字顶部），带 1 像素阴影，像老游戏那样好认。 */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: TextOpts = {}) {
  const size = opts.size ?? 12;
  ctx.font = font(size, opts.bold);
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'top';
  const shadow = opts.shadow ?? 'rgba(0,0,0,0.75)';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + 0.75, y + 0.75);
  }
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.fillText(text, x, y);
}

export function textWidth(ctx: CanvasRenderingContext2D, text: string, size = 12, bold = false) {
  ctx.font = font(size, bold);
  return ctx.measureText(text).width;
}

// 这些标点不能放在行首，遇到就挤回上一行。
const NO_LINE_START = '，。！？、；：”’）》」』…—,.!?;:)';

/** 按宽度折行，中文逐字折，保留手动换行。 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size = 12): string[] {
  ctx.font = font(size);
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxWidth && !NO_LINE_START.includes(ch)) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}
