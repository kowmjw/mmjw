import './style.css';
import { FieldScene } from './field/FieldScene';
import { Game } from './engine/game';
import { Input, bindTouchPad } from './engine/input';
import { Screen, VH, VW } from './engine/screen';
import { initHint } from './engine/hint';
import { unlockAudio } from './engine/sfx';
import { connectCloudSaves } from './engine/storage';
import { TitleScene } from './scenes/TitleScene';
import type { GameState } from './game/state';
import type { Scene } from './engine/game';
import { drawText } from './engine/text';
import { setHint } from './engine/hint';
import { RomAssets } from './rom/assets';
import { isKnownRom } from './rom/data';
import { loadRomFromArtifact, loadSavedRom } from './rom/romStore';
import { BattleStub, battleInfo } from './orig/BattleStub';
import { victoryEvent } from './rom/battle';
import { OrigField } from './orig/OrigField';
import { OrigTitle } from './orig/OrigTitle';
import type { OrigState } from './orig/state';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const pad = document.getElementById('pad') as HTMLElement;
const screen = new Screen(canvas);
const input = new Input(screen);
input.onUserGesture = unlockAudio;
bindTouchPad(input, pad);
initHint(document.getElementById('hint') as HTMLElement);

const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', touch);

/** 竖屏：画面在上、手柄在下；横屏：画面居中，手柄放两边。 */
function layout() {
  const W = window.innerWidth - 32;
  const H = window.innerHeight;
  const portrait = H >= window.innerWidth;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('landscape', !portrait);
  // 提示栏高度（和 style.css 里 #hint 的 height 保持一致）
  const hintH = touch && portrait ? 56 : 34;
  let cssW: number;
  if (touch && portrait) {
    const padH = Math.min(260, Math.max(190, H * 0.34));
    cssW = Math.min(W, ((H - padH - hintH) * VW) / VH);
  } else if (touch) {
    const fit = ((H - hintH) * VW) / VH;
    cssW = Math.min(fit, Math.max(W - 340, W * 0.62));
  } else {
    cssW = Math.min(W, ((H - hintH) * VW) / VH);
  }
  screen.setCssWidth(Math.floor(cssW));
  (document.getElementById('hint') as HTMLElement).style.maxWidth = `${Math.floor(cssW)}px`;
}
layout();
window.addEventListener('resize', layout);

const game = new Game(screen, input);
let assets: RomAssets | null = null;

// ───────── 没有 ROM：用我画的临时素材跑复刻剧情 ─────────
const title = () => new TitleScene(game, startGame, useRom);

function startGame(state: GameState) {
  void game.switchTo(new FieldScene(game, state, { toTitle: () => game.switchTo(title()) }));
}

// ───────── 有 ROM：原版画面、原版剧情 ─────────
const origTitle = () => new OrigTitle(game, assets!, startOrig);

function startOrig(state: OrigState) {
  const field: OrigField = new OrigField(game, assets!, state, {
    toTitle: () => game.switchTo(origTitle()),
    battle: (info) =>
      new Promise<void>((resolve) => {
        const after = victoryEvent(assets!.rom, info.battle);
        const stub = new BattleStub(game, assets!, battleInfo(info.battle), state.party, () => {
          if (after !== null) field.queueEvent(info.group, after);
          void game.switchTo(field).then(resolve);
        });
        void game.switchTo(stub);
      }),
  });
  void game.switchTo(field);
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __field: OrigField }).__field = field;
}

/** 导入了认得的 ROM：换成原版模式。 */
function useRom(rom: Uint8Array) {
  if (!isKnownRom(rom)) return false;
  assets = new RomAssets(rom);
  void game.switchTo(origTitle());
  return true;
}

/** 开头先找 ROM：本机存过的，或者 claude.ai 页面附件里的。 */
class Boot implements Scene {
  private t = 0;
  update(dt: number) {
    this.t += dt;
    setHint('');
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.t > 0.4) drawText(ctx, '正在读取原版数据…', VW / 2, VH / 2 - 6, { size: 12, align: 'center', color: '#aaa' });
  }
}

async function boot() {
  let rom: Uint8Array | null = null;
  try {
    const saved = await loadSavedRom();
    if (saved && isKnownRom(saved.rom)) rom = saved.rom;
    if (!rom) {
      const remote = await loadRomFromArtifact();
      if (remote && isKnownRom(remote.rom)) rom = remote.rom;
    }
  } catch (e) {
    console.warn(e);
  }
  if (rom) {
    assets = new RomAssets(rom);
    void game.switchTo(origTitle());
  } else {
    void game.switchTo(title());
  }
}

game.start(new Boot());
void connectCloudSaves().finally(() => void boot());

// 调试用：地址后面加 ?debug 可以在控制台里用 __game 查看状态
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Game }).__game = game;
