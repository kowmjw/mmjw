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
const title = () => new TitleScene(game, startGame);

function startGame(state: GameState) {
  void game.switchTo(new FieldScene(game, state, { toTitle: () => game.switchTo(title()) }));
}

game.start(title());
void connectCloudSaves();

// 调试用：地址后面加 ?debug 可以在控制台里用 __game 查看状态
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Game }).__game = game;
