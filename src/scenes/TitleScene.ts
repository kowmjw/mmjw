import { drawBrush } from '../art/brush';
import { renderFireTexture, renderTitleBackground } from '../art/title';
import type { Game, Scene } from '../engine/game';
import { VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { loadSlot } from '../engine/storage';
import { font } from '../engine/text';
import { UiLayer } from '../engine/ui';
import { slotItems } from '../game/saves';
import { newGame, type GameState } from '../game/state';

const ITEMS = ['开始游戏', '继续游戏'];
const ITEM_Y = [146, 178];
const ITEM_SIZE = 22;

let cachedBg: HTMLCanvasElement | null = null;
let cachedFire: HTMLCanvasElement | null = null;

export class TitleScene implements Scene {
  private index = 0;
  private t = 0;
  private busy = false;
  private readonly ui: UiLayer;
  private readonly bg = (cachedBg ??= renderTitleBackground());
  private readonly fire = (cachedFire ??= renderFireTexture(VW, 120));

  constructor(
    private readonly game: Game,
    private readonly start: (state: GameState, fresh: boolean) => void,
  ) {
    this.ui = new UiLayer(game.screen.ctx);
  }

  update(dt: number) {
    this.t += dt;
    const input = this.game.input;
    if (this.ui.update(dt, input) || this.busy) return;
    if (input.pressed('up') || input.pressed('down')) {
      this.index = 1 - this.index;
      sfx.cursor();
    }
    const tap = input.takeTap();
    if (tap) {
      const i = ITEM_Y.findIndex((y) => tap.y >= y - 4 && tap.y < y + ITEM_SIZE + 6 && Math.abs(tap.x - VW / 2) < 70);
      if (i >= 0) {
        this.index = i;
        void this.activate();
      }
    } else if (input.pressed('ok')) {
      void this.activate();
    }
  }

  private async activate() {
    this.busy = true;
    sfx.ok();
    if (this.index === 0) {
      this.start(newGame(), true);
      return;
    }
    const items = slotItems();
    if (!items.some((it) => it.enabled)) {
      this.ui.toast('还没有存档');
      this.busy = false;
      return;
    }
    const slot = await this.ui.choose(items, { title: '读取哪个存档？', width: 280 });
    const state = slot >= 0 ? loadSlot<GameState>(slot) : null;
    if (state) this.start(state, false);
    else this.busy = false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.drawImage(this.bg, 0, 0);
    drawBrush(ctx, '水浒传', 6, 8, 102, {
      fill: this.fire,
      fillAt: { x: 0, y: 8 },
      outline: '#140804',
      outlineWidth: 5,
      shadow: { dx: 4, dy: 4, color: 'rgba(10,4,0,0.85)' },
      offsets: [6, 12, 2],
    });
    ITEMS.forEach((label, i) => this.drawItem(ctx, label, ITEM_Y[i], i === this.index));
    ctx.font = font(8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText('非官方复刻 · 仅供个人学习交流', VW / 2 + 0.5, 213.5);
    ctx.fillStyle = '#f4f4ff';
    ctx.fillText('非官方复刻 · 仅供个人学习交流', VW / 2, 213);
    this.ui.draw(ctx);
  }

  /** 选中的是白到蓝的金属渐变，没选中的是灰色，照原版。 */
  private drawItem(ctx: CanvasRenderingContext2D, label: string, y: number, selected: boolean) {
    ctx.font = font(ITEM_SIZE, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(0, y, 0, y + ITEM_SIZE);
    if (selected) {
      const glow = 0.5 + Math.sin(this.t * 4) * 0.08;
      g.addColorStop(0, '#ffffff');
      g.addColorStop(glow - 0.08, '#dcefff');
      g.addColorStop(glow + 0.04, '#5a8ce4');
      g.addColorStop(1, '#162f8c');
    } else {
      g.addColorStop(0, '#e6e8ea');
      g.addColorStop(0.45, '#a8b0b8');
      g.addColorStop(0.55, '#5c646c');
      g.addColorStop(1, '#343a42');
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = selected ? '#08103a' : '#161a1e';
    ctx.strokeText(label, VW / 2 + 2, y + 2);
    ctx.strokeText(label, VW / 2, y);
    ctx.fillStyle = g;
    ctx.fillText(label, VW / 2, y);
  }
}
