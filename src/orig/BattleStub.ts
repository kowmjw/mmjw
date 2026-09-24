// 原版战斗还在移植。剧情走到开战的地方先显示这一屏，说明胜负条件，然后当作打赢了接着演剧情。

import type { Game, Scene } from '../engine/game';
import { setHint } from '../engine/hint';
import { VH, VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { drawText } from '../engine/text';
import { drawWindow } from '../engine/ui';
import type { RomAssets } from '../rom/assets';

export interface BattleInfo {
  title: string;
  win: string;
  lose: string;
}

/** 已经核对过胜负条件的战斗（按战斗编号）。其它的先只显示第几战。 */
export const KNOWN_BATTLES: Record<number, BattleInfo> = {
  0: { title: '第一战　郓城县街头', win: '敌方全灭', lose: '晁盖或燕青死亡' },
};

export function battleInfo(id: number): BattleInfo {
  return KNOWN_BATTLES[id] ?? { title: `第 ${id + 1} 战`, win: '（原版战斗移植中）', lose: '（原版战斗移植中）' };
}

export class BattleStub implements Scene {
  private t = 0;
  private done = false;

  constructor(
    private readonly game: Game,
    private readonly assets: RomAssets,
    private readonly info: BattleInfo,
    private readonly party: number[],
    private readonly finish: () => void,
  ) {}

  update(dt: number) {
    this.t += dt;
    const input = this.game.input;
    setHint('原版战斗还在移植中，点屏幕继续剧情（先当作打赢了）');
    if (this.done || this.t < 0.6) return;
    if (input.pressed('ok') || input.takeTap()) {
      this.done = true;
      sfx.win();
      this.finish();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#101828';
    ctx.fillRect(0, 0, VW, VH);
    drawWindow(ctx, 20, 16, VW - 40, VH - 32, 0.95);
    drawText(ctx, this.info.title, VW / 2, 30, { size: 16, bold: true, align: 'center', color: '#ffe9a8' });
    drawText(ctx, `胜利条件：${this.info.win}`, 40, 64, { size: 12 });
    drawText(ctx, `失败条件：${this.info.lose}`, 40, 84, { size: 12 });
    drawText(ctx, '出战：', 40, 112, { size: 12 });
    this.party.slice(0, 6).forEach((id, i) => {
      const sheet = this.assets.spriteSheet(id);
      ctx.drawImage(sheet, 0, 0, 32, 32, 84 + i * 36, 104, 32, 32);
    });
    drawText(ctx, '原版的战斗系统正在移植，下一版就能打。', VW / 2, 156, { size: 11, align: 'center', color: '#c8d0e0' });
    drawText(ctx, '现在先当作打赢了，继续看剧情。', VW / 2, 172, { size: 11, align: 'center', color: '#c8d0e0' });
    if (Math.floor(this.t * 2) % 2 === 0) drawText(ctx, '点屏幕继续', VW / 2, 194, { size: 12, align: 'center', color: '#fff' });
  }
}
