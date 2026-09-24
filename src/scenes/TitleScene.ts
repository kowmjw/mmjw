import { drawBrush } from '../art/brush';
import { renderFireTexture, renderTitleBackground } from '../art/title';
import type { Game, Scene } from '../engine/game';
import { setHint } from '../engine/hint';
import { VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { loadSlot } from '../engine/storage';
import { font } from '../engine/text';
import { UiLayer } from '../engine/ui';
import { slotItems } from '../game/saves';
import { loadRomBytes } from '../rom/romfile';
import { archiveKind, extractRomFromZip } from '../rom/unzip';
import { canUploadRom, pickFile, saveRom, uploadRomForAnalysis } from '../rom/romStore';
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
    const uiBusy = this.ui.update(dt, input);
    setHint(
      this.ui.modalHint() ?? (this.busy ? '' : '点「开始游戏」开始新游戏，点「继续游戏」读取存档。有原版 ROM 的话点右边导入'),
      this.ui.busy() || this.busy ? null : { label: '导入 ROM', onClick: () => void this.importRom() },
    );
    if (uiBusy || this.busy) return;
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

  /** 导入原版 ROM：存到本机，在 claude.ai 里还可以上传一份给 Claude 分析。 */
  private async importRom() {
    if (this.busy) return;
    // 必须在按钮点击里直接弹选文件框，手机浏览器才允许
    // 不按扩展名过滤：下载来的 ROM 扩展名五花八门，选错了会有提示
    const picking = pickFile('');
    this.busy = true;
    try {
      const file = await picking;
      if (!file) return;
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      let fileName = file.name;
      const kind = archiveKind(bytes);
      if (kind === 'rar' || kind === '7z') throw new Error(`这是 ${kind.toUpperCase()} 压缩包，请先解压，再选里面的 ROM 文件`);
      if (kind === 'zip') {
        const inner = await extractRomFromZip(bytes);
        bytes = inner.data;
        fileName = inner.name.split('/').pop() || inner.name;
      }
      const { rom, info } = loadRomBytes(bytes);
      const stored = await saveRom(rom, fileName);
      const mb = (info.size / 1024 / 1024).toFixed(2);
      await this.ui.say(
        null,
        `已导入：${fileName}（${mb} MB）\nCRC32 ${info.crc32}${info.wasSmd ? '，已从 SMD 格式转换' : ''}${stored ? '' : '\n这台设备存不下，下次打开要重新导入'}`,
      );
      if (!(await canUploadRom())) {
        await this.ui.say(null, 'ROM 只存在这台设备上。要让 Claude 分析，请在 claude.ai 里打开这个游戏页面再导入一次。');
        return;
      }
      const i = await this.ui.ask(null, '要上传一份给 Claude 分析吗？上传后只有能打开这个游戏页面的人看得到（目前只有你）。', ['上传', '先不用']);
      if (i !== 0) return;
      this.ui.toast('正在上传……', 60);
      try {
        const id = await uploadRomForAnalysis(rom, info, fileName);
        this.ui.toast('上传完成', 2);
        await this.ui.say(null, `上传完成！回到和 Claude 的对话里说一声「ROM 传好了」就行。\n（附件编号 ${id.slice(0, 8)}）`);
      } catch (e) {
        this.ui.toast('上传失败', 2);
        await this.ui.say(null, e instanceof Error ? e.message : '上传失败');
      }
    } catch (e) {
      await this.ui.say(null, e instanceof Error ? e.message : '导入失败');
    } finally {
      this.busy = false;
    }
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
