import { drawBrush, brushWidth } from '../art/brush';
import type { Input } from './input';
import { VH, VW } from './screen';
import { sfx } from './sfx';
import { settings } from './storage';
import { drawText, textWidth, wrapText } from './text';

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

/** MD 时代 RPG 常见的蓝底白框窗口。 */
export function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.9) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(46,62,156,${alpha})`);
  g.addColorStop(1, `rgba(14,22,70,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  frame(ctx, x, y, w, h, '#0a0f24');
  frame(ctx, x + 1, y + 1, w - 2, h - 2, '#eef0ff');
  frame(ctx, x + 2, y + 2, w - 4, h - 4, '#6a7cd0');
}

/** 选中项前面的小三角。 */
export function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const dx = Math.round(Math.sin(t * 8) * 1.2);
  ctx.fillStyle = '#ffe070';
  ctx.beginPath();
  ctx.moveTo(x + dx, y);
  ctx.lineTo(x + dx + 5, y + 4);
  ctx.lineTo(x + dx, y + 8);
  ctx.closePath();
  ctx.fill();
}

export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number) {
  ctx.fillStyle = '#101018';
  ctx.fillRect(x, y, w, h);
  const r = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = r > 0.5 ? '#50d860' : r > 0.25 ? '#f0d040' : '#f05040';
  ctx.fillRect(x, y, Math.round(w * r), h);
}

interface Modal {
  done: boolean;
  update(dt: number, input: Input): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface MenuItem {
  label: string;
  enabled?: boolean;
  /** 右侧附加信息，比如数量 */
  right?: string;
}

export interface MenuOpts {
  x?: number;
  y?: number;
  width?: number;
  title?: string;
  cancelable?: boolean;
  maxVisible?: number;
  start?: number;
}

const LINE_H = 16;

export class Menu implements Modal {
  done = false;
  index = 0;
  private scroll = 0;
  private t = 0;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  private readonly visible: number;
  private readonly titleH: number;

  constructor(
    readonly items: MenuItem[],
    private readonly opts: MenuOpts,
    ctx: CanvasRenderingContext2D,
    private readonly resolve: (i: number) => void,
  ) {
    this.visible = Math.min(items.length, opts.maxVisible ?? 8);
    this.titleH = opts.title ? 16 : 0;
    let w = opts.width ?? 0;
    if (!w) {
      for (const it of items) w = Math.max(w, textWidth(ctx, it.label) + (it.right ? textWidth(ctx, it.right) + 14 : 0));
      if (opts.title) w = Math.max(w, textWidth(ctx, opts.title) - 8);
      w += 30;
    }
    this.w = Math.max(w, 64);
    this.h = this.visible * LINE_H + 10 + this.titleH;
    this.x = Math.round(Math.max(2, Math.min(VW - this.w - 2, opts.x ?? (VW - this.w) / 2)));
    this.y = Math.round(Math.max(2, Math.min(VH - this.h - 2, opts.y ?? (VH - this.h) / 2)));
    const first = items.findIndex((it) => it.enabled !== false);
    this.index = Math.max(0, opts.start ?? first);
    this.fixScroll();
  }

  private fixScroll() {
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + this.visible) this.scroll = this.index - this.visible + 1;
  }

  private finish(i: number) {
    this.done = true;
    this.resolve(i);
  }

  update(dt: number, input: Input) {
    this.t += dt;
    const n = this.items.length;
    if (input.pressed('up')) {
      this.index = (this.index - 1 + n) % n;
      sfx.cursor();
    }
    if (input.pressed('down')) {
      this.index = (this.index + 1) % n;
      sfx.cursor();
    }
    this.fixScroll();
    const tap = input.takeTap();
    if (tap) {
      const inside = tap.x >= this.x && tap.x < this.x + this.w && tap.y >= this.y && tap.y < this.y + this.h;
      if (inside) {
        const row = Math.floor((tap.y - this.y - 5 - this.titleH) / LINE_H) + this.scroll;
        if (tap.y < this.y + 5 + this.titleH) {
          if (this.scroll > 0) this.scroll--;
        } else if (row >= this.scroll + this.visible) {
          if (this.scroll + this.visible < n) this.scroll++;
        } else if (row >= 0 && row < n) {
          this.index = row;
          this.choose();
        }
      } else if (this.opts.cancelable !== false) {
        sfx.cancel();
        this.finish(-1);
      }
      return;
    }
    if (input.pressed('ok')) this.choose();
    else if (input.pressed('cancel') && this.opts.cancelable !== false) {
      sfx.cancel();
      this.finish(-1);
    }
  }

  private choose() {
    if (this.items[this.index].enabled === false) {
      sfx.cancel();
      return;
    }
    sfx.ok();
    this.finish(this.index);
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawWindow(ctx, this.x, this.y, this.w, this.h);
    let y = this.y + 5;
    if (this.opts.title) {
      drawText(ctx, this.opts.title, this.x + 10, y + 1, { color: '#ffe070' });
      y += this.titleH;
    }
    for (let i = this.scroll; i < this.scroll + this.visible; i++) {
      const it = this.items[i];
      const color = it.enabled === false ? '#8088a8' : '#ffffff';
      drawText(ctx, it.label, this.x + 18, y + 2, { color });
      if (it.right) drawText(ctx, it.right, this.x + this.w - 9, y + 2, { color, align: 'right' });
      if (i === this.index) drawCursor(ctx, this.x + 7, y + 4, this.t);
      y += LINE_H;
    }
    if (this.scroll > 0) drawText(ctx, '▲', this.x + this.w - 14, this.y + this.titleH + 3, { size: 8 });
    if (this.scroll + this.visible < this.items.length) drawText(ctx, '▼', this.x + this.w - 14, this.y + this.h - 11, { size: 8 });
  }
}

const BOX_H = 58;
const LINES_PER_PAGE = 3;

/** 屏幕下方的对话框，逐字显示。fixed 的只显示不等按键（给选项菜单当题目）。 */
class Dialogue implements Modal {
  done = false;
  private lines: string[];
  private page = 0;
  private shown = 0;
  private t = 0;

  constructor(
    ctx: CanvasRenderingContext2D,
    private readonly speaker: string | null,
    text: string,
    private readonly portrait: HTMLCanvasElement | null,
    private readonly fixed: boolean,
    private readonly resolve: () => void,
  ) {
    this.lines = wrapText(ctx, text, VW - 8 - (portrait ? 64 : 24));
    if (fixed) this.shown = Infinity;
  }

  private pageText() {
    return this.lines.slice(this.page * LINES_PER_PAGE, this.page * LINES_PER_PAGE + LINES_PER_PAGE);
  }

  close() {
    this.done = true;
    this.resolve();
  }

  update(dt: number, input: Input) {
    this.t += dt;
    if (this.fixed) return;
    const total = this.pageText().join('').length;
    this.shown = Math.min(total, this.shown + dt * settings.textSpeed);
    const tap = input.takeTap();
    if (input.pressed('ok') || input.pressed('cancel') || tap) {
      if (this.shown < total) {
        this.shown = total;
      } else if ((this.page + 1) * LINES_PER_PAGE < this.lines.length) {
        this.page++;
        this.shown = 0;
      } else {
        this.close();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const x = 4;
    const y = VH - BOX_H - 4;
    drawWindow(ctx, x, y, VW - 8, BOX_H);
    let tx = x + 11;
    if (this.portrait) {
      ctx.fillStyle = '#1a2250';
      ctx.fillRect(x + 8, y + 9, 40, 40);
      ctx.drawImage(this.portrait, 0, 0, 16, 16, x + 12, y + 13, 32, 32);
      tx = x + 56;
    }
    if (this.speaker) {
      const w = textWidth(ctx, this.speaker) + 16;
      drawWindow(ctx, x + 6, y - 12, w, 17);
      drawText(ctx, this.speaker, x + 14, y - 10, { color: '#ffe070' });
    }
    let left = this.shown;
    this.pageText().forEach((line, i) => {
      drawText(ctx, line.slice(0, Math.max(0, Math.floor(left))), tx, y + 9 + i * 15);
      left -= line.length;
    });
    if (!this.fixed && left >= 0 && Math.floor(this.t * 3) % 2 === 0) {
      drawText(ctx, '▼', VW - 18, y + BOX_H - 14, { size: 8, color: '#ffe070' });
    }
  }
}

/** 自定义内容的面板，按任意键关闭。 */
class Panel implements Modal {
  done = false;
  constructor(
    private readonly paint: (ctx: CanvasRenderingContext2D) => void,
    private readonly resolve: () => void,
  ) {}
  update(_dt: number, input: Input) {
    if (input.takeTap() || input.pressed('ok') || input.pressed('cancel')) {
      sfx.cursor();
      this.done = true;
      this.resolve();
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    this.paint(ctx);
  }
}

/** 黑底旁白：标题（毛笔字）加上一行行淡入的文字。 */
class Narration implements Modal {
  done = false;
  private t = 0;
  constructor(
    private readonly lines: string[],
    private readonly title: string | null,
    private readonly subtitle: string | null,
    private readonly resolve: () => void,
  ) {}
  private get allShown() {
    return this.t >= this.lines.length * 0.7 + 0.6;
  }
  update(dt: number, input: Input) {
    this.t += dt;
    if (input.takeTap() || input.pressed('ok') || input.pressed('cancel')) {
      if (!this.allShown) this.t = 99;
      else {
        this.done = true;
        this.resolve();
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    let y = 24;
    if (this.title) {
      const size = this.lines.length ? 40 : 56;
      const w = brushWidth(this.title, size);
      if (!this.lines.length) y = this.subtitle ? 64 : 84;
      drawBrush(ctx, this.title, (VW - w) / 2, y, size, { fill: '#f4e6c4', outline: '#5a1a10', outlineWidth: 3 });
      y += size + 6;
      if (this.subtitle) {
        const sw = brushWidth(this.subtitle, size * 0.62);
        drawBrush(ctx, this.subtitle, (VW - sw) / 2, y, size * 0.62, { fill: '#e8b060', outline: '#3a1008', outlineWidth: 2 });
        y += size * 0.62 + 8;
      }
    }
    const lineH = 17;
    const top = this.title ? y : (VH - this.lines.length * lineH) / 2;
    this.lines.forEach((line, i) => {
      const a = Math.max(0, Math.min(1, (this.t - i * 0.7) / 0.6));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      drawText(ctx, line, VW / 2, top + i * lineH, { align: 'center', color: '#f0ead8' });
      ctx.globalAlpha = 1;
    });
    if (this.allShown && Math.floor(this.t * 2) % 2 === 0) drawText(ctx, '▼', VW - 16, VH - 14, { size: 8, color: '#ffe070' });
  }
}

/** 每个场景一份：管理对话框、菜单等弹窗，给剧情脚本提供 await 用的接口。 */
export class UiLayer {
  private stack: Modal[] = [];
  private notice: { text: string; t: number } | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  busy() {
    return this.stack.length > 0;
  }

  /** 有弹窗时处理输入并返回 true，场景自己就不要再处理输入了。 */
  update(dt: number, input: Input): boolean {
    if (this.notice) {
      this.notice.t -= dt;
      if (this.notice.t <= 0) this.notice = null;
    }
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    top.update(dt, input);
    this.stack = this.stack.filter((m) => !m.done);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.notice) {
      const w = textWidth(ctx, this.notice.text) + 24;
      drawWindow(ctx, (VW - w) / 2, 8, w, 22);
      drawText(ctx, this.notice.text, VW / 2, 13, { align: 'center' });
    }
    for (const m of this.stack) m.draw(ctx);
  }

  say(speaker: string | null, text: string, portrait: HTMLCanvasElement | null = null): Promise<void> {
    return new Promise((r) => this.stack.push(new Dialogue(this.ctx, speaker, text, portrait, false, r)));
  }

  choose(items: (string | MenuItem)[], opts: MenuOpts = {}): Promise<number> {
    const list = items.map((it) => (typeof it === 'string' ? { label: it } : it));
    return new Promise((r) => this.stack.push(new Menu(list, opts, this.ctx, r)));
  }

  /** 先把问题显示在对话框里，再弹出选项；取消返回 -1。 */
  async ask(speaker: string | null, text: string, options: string[], portrait: HTMLCanvasElement | null = null, cancelable = true): Promise<number> {
    const d = new Dialogue(this.ctx, speaker, text, portrait, true, () => {});
    this.stack.push(d);
    const h = options.length * LINE_H + 10;
    const i = await this.choose(options, { x: VW - 112, y: VH - 66 - h, width: 104, cancelable });
    d.close();
    this.stack = this.stack.filter((m) => !m.done);
    return i;
  }

  panel(paint: (ctx: CanvasRenderingContext2D) => void): Promise<void> {
    return new Promise((r) => this.stack.push(new Panel(paint, r)));
  }

  narrate(lines: string[], title: string | null = null, subtitle: string | null = null): Promise<void> {
    return new Promise((r) => this.stack.push(new Narration(lines, title, subtitle, r)));
  }

  /** 屏幕上方短暂提示，不打断操作。 */
  toast(text: string, seconds = 1.6) {
    this.notice = { text, t: seconds };
  }
}
