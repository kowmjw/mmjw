import './style.css';
import { FieldScene } from './field/FieldScene';
import { Game } from './engine/game';
import { Input, bindTouchPad } from './engine/input';
import { Screen, VH, VW } from './engine/screen';
import { unlockAudio } from './engine/sfx';
import { TitleScene } from './scenes/TitleScene';
import type { GameState } from './game/state';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const pad = document.getElementById('pad') as HTMLElement;
const screen = new Screen(canvas);
const input = new Input(screen);
input.onUserGesture = unlockAudio;
bindTouchPad(input, pad);

const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', touch);

/** 竖屏：画面在上、手柄在下；横屏：画面居中，手柄放两边。 */
function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const portrait = H >= W;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('landscape', !portrait);
  let cssW: number;
  if (touch && portrait) {
    const padH = Math.min(260, Math.max(190, H * 0.36));
    cssW = Math.min(W, ((H - padH) * VW) / VH);
  } else if (touch) {
    const fit = (H * VW) / VH;
    cssW = Math.min(fit, Math.max(W - 340, W * 0.62));
  } else {
    cssW = Math.min(W, (H * VW) / VH);
  }
  screen.setCssWidth(Math.floor(cssW));
}
layout();
window.addEventListener('resize', layout);

const game = new Game(screen, input);
const title = () => new TitleScene(game, startGame);

function startGame(state: GameState) {
  void game.switchTo(new FieldScene(game, state, { toTitle: () => game.switchTo(title()) }));
}

game.start(title());

// 调试用：地址后面加 ?debug 可以在控制台里用 __game 查看状态
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Game }).__game = game;
