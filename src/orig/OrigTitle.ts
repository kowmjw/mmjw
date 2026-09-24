// 原版标题画面：图块、版面、调色板都从 ROM 读。第一次进来先显示星空，再往下卷到山景（原版开场也是这样）。

import type { Game, Scene } from '../engine/game';
import { setHint } from '../engine/hint';
import { VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { hasAnySave, loadSlot, ORIG_SLOT_BASE } from '../engine/storage';
import { UiLayer } from '../engine/ui';
import { slotItems } from '../game/saves';
import type { RomAssets } from '../rom/assets';
import { newOrigState, isOrigState, type OrigState } from './state';

const SKY_SCROLL = 288;
let introShown = false;

export class OrigTitle implements Scene {
  private index = 0;
  private scroll = introShown ? SKY_SCROLL : 0;
  private logoAlpha = introShown ? 1 : 0;
  private busy = false;
  private readonly ui: UiLayer;

  constructor(
    private readonly game: Game,
    private readonly assets: RomAssets,
    private readonly start: (state: OrigState) => void,
  ) {
    this.ui = new UiLayer(game.screen.ctx);
  }

  private get ready() {
    return this.scroll >= SKY_SCROLL && this.logoAlpha >= 1;
  }

  update(dt: number) {
    const input = this.game.input;
    const uiBusy = this.ui.update(dt, input);
    if (!this.ready) {
      this.scroll = Math.min(SKY_SCROLL, this.scroll + dt * 110);
      if (this.scroll >= SKY_SCROLL) this.logoAlpha = Math.min(1, this.logoAlpha + dt * 1.5);
      if (input.pressed('ok') || input.takeTap()) {
        this.scroll = SKY_SCROLL;
        this.logoAlpha = 1;
      }
      if (this.ready) introShown = true;
      setHint('点屏幕跳过');
      return;
    }
    setHint(this.ui.modalHint() ?? (this.busy ? '' : '原版数据已读取。点「开始游戏」从头玩，点「继续游戏」读取存档'));
    if (uiBusy || this.busy) return;
    if (input.pressed('up') || input.pressed('down')) {
      this.index = 1 - this.index;
      sfx.cursor();
    }
    const tap = input.takeTap();
    if (tap) {
      const i = [128, 160].findIndex((y) => tap.y >= y - 4 && tap.y < y + 28 && Math.abs(tap.x - VW / 2) < 60);
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
      this.start(newOrigState(this.assets.rom));
      return;
    }
    if (!hasAnySave(ORIG_SLOT_BASE)) {
      this.ui.toast('还没有存档');
      this.busy = false;
      return;
    }
    const slot = await this.ui.choose(slotItems(0, true, ORIG_SLOT_BASE), { title: '读取哪个存档？', width: 280 });
    const state = slot >= 0 ? loadSlot<OrigState>(ORIG_SLOT_BASE + slot) : null;
    if (state && isOrigState(state)) this.start(state);
    else this.busy = false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const art = this.assets.titleArt();
    ctx.drawImage(art.sky, 0, Math.round(this.scroll), 320, 224, 0, 0, 320, 224);
    if (this.logoAlpha > 0) {
      ctx.globalAlpha = this.logoAlpha;
      ctx.drawImage(art.logo, 32, 24);
      ctx.drawImage(art.start[this.index === 0 ? 1 : 0], 104, 128);
      ctx.drawImage(art.load[this.index === 1 ? 1 : 0], 104, 160);
      ctx.globalAlpha = 1;
    }
    this.ui.draw(ctx);
  }
}
