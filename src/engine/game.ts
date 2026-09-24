import type { Input } from './input';
import { VH, VW, type Screen } from './screen';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** 主循环：每帧更新输入和当前场景，负责场景之间的黑屏淡入淡出。 */
export class Game {
  scene: Scene | null = null;
  private fade = 1;
  private fadeTarget = 0;
  private fadeSpeed = 4;
  private fadeDone: (() => void) | null = null;
  private last = 0;

  constructor(
    readonly screen: Screen,
    readonly input: Input,
  ) {}

  start(scene: Scene) {
    this.scene = scene;
    scene.enter?.();
    this.fadeTo(0, 400);
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.input.setSuppressed(this.fade > 0.01 || this.fadeDone !== null);
    this.input.update(dt);
    this.stepFade(dt);
    this.scene?.update(dt);
    this.screen.begin();
    const ctx = this.screen.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    this.scene?.draw(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    requestAnimationFrame(this.frame);
  };

  private stepFade(dt: number) {
    if (this.fade === this.fadeTarget) return;
    const d = this.fadeSpeed * dt;
    this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + d) : Math.max(this.fadeTarget, this.fade - d);
    if (this.fade === this.fadeTarget && this.fadeDone) {
      const done = this.fadeDone;
      this.fadeDone = null;
      done();
    }
  }

  fadeTo(target: number, ms = 300): Promise<void> {
    this.fadeTarget = target;
    this.fadeSpeed = 1000 / Math.max(ms, 1);
    if (this.fade === target) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = this.fadeDone;
      this.fadeDone = () => {
        prev?.();
        resolve();
      };
    });
  }

  /** 黑屏切到下一个场景。 */
  async switchTo(scene: Scene, ms = 300) {
    await this.fadeTo(1, ms);
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter?.();
    await this.fadeTo(0, ms);
  }
}

export function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
