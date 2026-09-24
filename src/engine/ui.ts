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

export class Menu {
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
    private readonly opts: MenuOpts = {},
    ctx?: CanvasRenderingContext2D,
  ) {
    this.visible = Math.min(items.length, opts.maxVisible ?? 8);
    this.titleH = opts.title ? 16 : 0;
    let w = opts.width ?? 0;
    if (!w && ctx) {
      for (const it of items) w = Math.max(w, textWidth(ctx, it.label) + (it.right ? textWidth(ctx, it.right) + 12 : 0));
      if (opts.title) w = Math.max(w, textWidth(ctx, opts.title));
      w += 30;
    }
    this.w = Math.max(w || 96, 64);
    this.h = this.visible * LINE_H + 10 + this.titleH;
    this.x = Math.round(opts.x ?? (VW - this.w) / 2);
    this.y = Math.round(opts.y ?? (VH - this.h) / 2);
    const start = opts.start ?? items.findIndex((it) => it.enabled !== false);
    this.index = Math.max(0, start);
    this.fixScroll();
  }

  private fixScroll() {
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + this.visible) this.scroll = this.index - this.visible + 1;
  }

  /** 返回选中的序号；取消返回 -1；还没选返回 null。 */
  update(dt: number, input: Input): number | null {
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
        if (row >= 0 && row < n && row < this.scroll + this.visible) {
          this.index = row;
          return this.choose();
        }
        return null;
      }
      if (this.opts.cancelable !== false) {
        sfx.cancel();
        return -1;
      }
      return null;
    }
    if (input.pressed('ok')) return this.choose();
    if (input.pressed('cancel') && this.opts.cancelable !== false) {
      sfx.cancel();
      return -1;
    }
    return null;
  }

  private choose(): number | null {
    if (this.items[this.index].enabled === false) {
      sfx.cancel();
      return null;
    }
    sfx.ok();
    return this.index;
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
    if (this.scroll > 0) drawText(ctx, '▲', this.x + this.w / 2, this.y + this.titleH + 1, { size: 8, align: 'center' });
    if (this.scroll + this.visible < this.items.length) drawText(ctx, '▼', this.x + this.w / 2, this.y + this.h - 9, { size: 8, align: 'center' });
  }
}

const BOX_H = 58;
const LINES_PER_PAGE = 3;

/** 屏幕下方的对话框，逐字显示。 */
export class Dialogue {
  active = false;
  /** 只显示不等待按键（给选项菜单当题目用） */
  private fixed = false;
  private speaker: string | null = null;
  private portrait: HTMLCanvasElement | null = null;
  private lines: string[] = [];
  private page = 0;
  private shown = 0;
  private t = 0;
  private resolve: (() => void) | null = null;

  constructor(private readonly measure: CanvasRenderingContext2D) {}

  open(speaker: string | null, text: string, portrait: HTMLCanvasElement | null = null, fixed = false): Promise<void> {
    this.speaker = speaker;
    this.portrait = portrait;
    this.lines = wrapText(this.measure, text, VW - 8 - (portrait ? 58 : 22));
    this.page = 0;
    this.shown = fixed ? Infinity : 0;
    this.fixed = fixed;
    this.active = true;
    return new Promise((r) => {
      this.resolve = r;
    });
  }

  close() {
    this.active = false;
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  private pageText() {
    return this.lines.slice(this.page * LINES_PER_PAGE, this.page * LINES_PER_PAGE + LINES_PER_PAGE);
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
    if (!this.active) return;
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
      const part = line.slice(0, Math.max(0, Math.floor(left)));
      left -= line.length;
      drawText(ctx, part, tx, y + 9 + i * 15);
    });
    if (!this.fixed && left >= 0 && Math.floor(this.t * 3) % 2 === 0) {
      drawText(ctx, '▼', VW - 18, y + BOX_H - 14, { size: 8, color: '#ffe070' });
    }
  }
}

/** 每个场景一份：管理对话框和菜单，给剧情脚本提供 await 用的接口。 */
export class UiLayer {
  readonly dialogue: Dialogue;
  private menus: { menu: Menu; resolve: (i: number) => void }[] = [];
  private notice: { text: string; t: number } | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.dialogue = new Dialogue(ctx);
  }

  busy() {
    return this.dialogue.active || this.menus.length > 0;
  }

  /** 有弹窗时处理输入并返回 true，场景自己就不要再处理输入了。 */
  update(dt: number, input: Input): boolean {
    if (this.notice) {
      this.notice.t -= dt;
      if (this.notice.t <= 0) this.notice = null;
    }
    const top = this.menus[this.menus.length - 1];
    if (top) {
      const r = top.menu.update(dt, input);
      if (r !== null) {
        this.menus.pop();
        top.resolve(r);
      }
      return true;
    }
    if (this.dialogue.active) {
      this.dialogue.update(dt, input);
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.dialogue.draw(ctx);
    for (const m of this.menus) m.menu.draw(ctx);
    if (this.notice) {
      const w = textWidth(ctx, this.notice.text) + 24;
      drawWindow(ctx, (VW - w) / 2, 8, w, 22);
      drawText(ctx, this.notice.text, VW / 2, 13, { align: 'center' });
    }
  }

  say(speaker: string | null, text: string, portrait: HTMLCanvasElement | null = null) {
    return this.dialogue.open(speaker, text, portrait);
  }

  choose(items: (string | MenuItem)[], opts: MenuOpts = {}): Promise<number> {
    const list = items.map((it) => (typeof it === 'string' ? { label: it } : it));
    return new Promise((resolve) => this.menus.push({ menu: new Menu(list, opts, this.ctx), resolve }));
  }

  /** 先把问题显示在对话框里，再弹出选项。 */
  async ask(speaker: string | null, text: string, options: string[], portrait: HTMLCanvasElement | null = null): Promise<number> {
    void this.dialogue.open(speaker, text, portrait, true);
    const i = await this.choose(options, { x: VW - 104, y: VH - 66 - (options.length * 16 + 10), width: 96 });
    this.dialogue.close();
    return i;
  }

  /** 屏幕上方短暂提示，不打断操作。 */
  toast(text: string, seconds = 1.6) {
    this.notice = { text, t: seconds };
  }
}
