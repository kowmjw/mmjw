// 原版样式的对话框：浅灰底、黑边、48×48 头像，3 行 × 16 字，用 ROM 里的字库一个字一个字打出来。
// 主角在画面下半部时对话框放到上面，主角靠左时头像放到右边（原版 $FF6141 的规则）。

import type { Input } from '../engine/input';
import { makeCanvas } from '../engine/pixel';
import { sfx } from '../engine/sfx';
import { settings } from '../engine/storage';
import type { RomAssets } from '../rom/assets';
import { decodeMessageAt, type Glyph, type Line, type MessagePart } from '../rom/text';

const BOX_W = 272;
const BOX_H = 64;
const BOX_X = 24;
const FILL = 13; // 人物调色板里的浅灰
const INK = 1; // 黑字
const RED = 10; // 红色高亮

export interface MsgLayout {
  top: boolean;
  portraitRight: boolean;
}

interface Page {
  portrait: number;
  lines: Line[];
}

export class MessageBox {
  private pages: Page[] = [];
  private page = 0;
  private shown = 0;
  private t = 0;
  private layout: MsgLayout = { top: false, portraitRight: false };
  private done: (() => void) | null = null;
  private frame: HTMLCanvasElement | null = null;
  /** 原版跨消息保持字库页 */
  bank = 0;

  constructor(private readonly assets: RomAssets) {}

  get active() {
    return this.done !== null;
  }

  /** 显示从 ROM 地址 a 开始的消息。portraitOverride：跟 NPC 说话时第一段的头像用 NPC 的人物号。 */
  show(a: number, layout: MsgLayout, portraitOverride?: number): Promise<void> {
    const { parts, bank } = decodeMessageAt(this.assets.rom.b, a, this.bank);
    this.bank = bank;
    return this.showParts(parts, layout, portraitOverride);
  }

  showParts(parts: MessagePart[], layout: MsgLayout, portraitOverride?: number): Promise<void> {
    this.pages = [];
    parts.forEach((p, i) => {
      const portrait = i === 0 && portraitOverride !== undefined ? portraitOverride : p.portrait;
      for (const lines of p.pages) this.pages.push({ portrait, lines });
    });
    if (!this.pages.length) return Promise.resolve();
    this.page = 0;
    this.shown = 0;
    this.t = 0;
    this.layout = layout;
    return new Promise((resolve) => (this.done = resolve));
  }

  /** 直接显示一串字（系统提示用），一页。 */
  showGlyphs(lines: Glyph[][], layout: MsgLayout): Promise<void> {
    return this.showParts([{ portrait: 0, pages: [lines] }], layout);
  }

  private get total() {
    const p = this.pages[this.page];
    return p ? p.lines.reduce((n, l) => n + l.length, 0) : 0;
  }

  update(dt: number, input: Input) {
    if (!this.done) return;
    const speed = Math.max(10, settings.textSpeed);
    this.t += dt;
    const ok = input.pressed('ok') || input.takeTap() !== null || input.pressed('cancel');
    if (this.shown < this.total) {
      this.shown = Math.min(this.total, Math.floor(this.t * speed));
      if (ok) this.shown = this.total;
      return;
    }
    if (!ok) return;
    sfx.cursor();
    this.page++;
    this.shown = 0;
    this.t = 0;
    if (this.page >= this.pages.length) {
      const done = this.done;
      this.done = null;
      done();
    }
  }

  /** 边框做成一张图（272×64），第一次用时生成。 */
  private boxArt() {
    if (this.frame) return this.frame;
    const tiles = this.assets.windowTiles();
    const c = makeCanvas(BOX_W, BOX_H);
    const g = c.getContext('2d')!;
    const put = (t: number, x: number, y: number, hf: boolean, vf: boolean) => {
      g.save();
      g.translate(x + (hf ? 8 : 0), y + (vf ? 8 : 0));
      g.scale(hf ? -1 : 1, vf ? -1 : 1);
      g.drawImage(tiles, t * 8, 0, 8, 8, 0, 0, 8, 8);
      g.restore();
    };
    const cols = BOX_W / 8;
    const rows = BOX_H / 8;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const edgeX = col === 0 || col === cols - 1;
        const edgeY = r === 0 || r === rows - 1;
        const hf = col === cols - 1;
        const vf = r === rows - 1;
        if (edgeX && edgeY) put(0, col * 8, r * 8, hf, vf);
        else if (edgeY) put(1, col * 8, r * 8, false, vf);
        else if (edgeX) put(2, col * 8, r * 8, hf, false);
        else put(3, col * 8, r * 8, false, false);
      }
    }
    this.frame = c;
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    if (!this.done) return;
    const p = this.pages[this.page];
    if (!p) return;
    const boxY = this.layout.top ? 8 : 152;
    const portraitY = this.layout.top ? 72 : 104;
    const portraitX = this.layout.portraitRight ? 320 - BOX_X - 48 : BOX_X;
    const face = this.assets.portrait(p.portrait);
    if (face) ctx.drawImage(face, portraitX, portraitY);
    ctx.drawImage(this.boxArt(), BOX_X, boxY);
    let n = this.shown;
    let lastX = 32;
    let lastY = boxY + 8;
    p.lines.forEach((line, row) => {
      line.forEach((g, col) => {
        if (n-- <= 0) return;
        const atlas = this.assets.glyphAtlas(g.bank, this.assets.peopleColor(g.red ? RED : INK));
        const x = 32 + col * 16;
        const y = boxY + 8 + row * 16;
        ctx.drawImage(atlas, (g.code % 16) * 16, Math.floor(g.code / 16) * 16, 16, 16, x, y, 16, 16);
        lastX = x + 16;
        lastY = y;
      });
    });
    // 翻页箭头：打完一页后在最后一个字后面闪
    if (this.shown >= this.total && Math.floor(time * 3) % 2 === 0) {
      const tiles = this.assets.windowTiles();
      const ax = Math.min(lastX, BOX_X + BOX_W - 24);
      ctx.drawImage(tiles, 4 * 8, 0, 8, 8, ax, lastY + 2, 8, 8);
      ctx.drawImage(tiles, 5 * 8, 0, 8, 8, ax, lastY + 10, 8, 8);
      ctx.drawImage(tiles, 6 * 8, 0, 8, 8, ax + 8, lastY + 2, 8, 8);
      ctx.drawImage(tiles, 7 * 8, 0, 8, 8, ax + 8, lastY + 10, 8, 8);
    }
  }
}

/** 界面填充色，给其它窗口用。 */
export function fillColorIndex() {
  return FILL;
}
