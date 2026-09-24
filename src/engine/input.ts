import type { Screen } from './screen';

export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'cancel' | 'menu';
export interface Tap {
  x: number;
  y: number;
}

const DIRECTIONS: readonly Action[] = ['up', 'down', 'left', 'right'];
const REPEAT_DELAY = 0.28;
const REPEAT_RATE = 0.09;

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'ok',
  Space: 'ok',
  KeyZ: 'ok',
  KeyJ: 'ok',
  Escape: 'cancel',
  Backspace: 'cancel',
  KeyX: 'cancel',
  KeyK: 'cancel',
  KeyC: 'menu',
  KeyM: 'menu',
  Tab: 'menu',
};

/** 键盘、屏幕手柄和点屏统一成同一套按键动作，场景每帧查询。 */
export class Input {
  private held = new Set<Action>();
  private queued: Action[] = [];
  private pressedNow = new Set<Action>();
  private repeat = new Map<Action, number>();
  private taps: Tap[] = [];
  private tapNow: Tap | null = null;
  private suppressed = false;
  /** 第一次有用户操作时调用（用来解锁网页音频） */
  onUserGesture: (() => void) | null = null;

  constructor(private readonly screen: Screen) {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.gesture();
      if (!e.repeat) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    window.addEventListener('blur', () => this.releaseAll());
    screen.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.gesture();
      this.taps.push(this.screen.toVirtual(e.clientX, e.clientY));
    });
    screen.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private gesture() {
    this.onUserGesture?.();
  }

  press(a: Action) {
    this.gesture();
    if (this.held.has(a)) return;
    this.held.add(a);
    this.queued.push(a);
    if (DIRECTIONS.includes(a)) this.repeat.set(a, REPEAT_DELAY);
  }

  release(a: Action) {
    this.held.delete(a);
    this.repeat.delete(a);
  }

  releaseAll() {
    for (const a of [...this.held]) this.release(a);
  }

  /** 每帧开始时调用一次，算出这一帧新按下的动作（方向键按住会自动连发）。 */
  update(dt: number) {
    this.pressedNow.clear();
    this.tapNow = null;
    if (this.suppressed) {
      this.queued.length = 0;
      this.taps.length = 0;
      return;
    }
    for (const a of this.queued) this.pressedNow.add(a);
    this.queued.length = 0;
    for (const [a, t] of this.repeat) {
      const left = t - dt;
      if (left <= 0) {
        this.pressedNow.add(a);
        this.repeat.set(a, REPEAT_RATE);
      } else {
        this.repeat.set(a, left);
      }
    }
    this.tapNow = this.taps.shift() ?? null;
  }

  /** 转场时屏蔽输入，避免一次按键被下一个场景接到。 */
  setSuppressed(v: boolean) {
    this.suppressed = v;
    if (v) {
      this.pressedNow.clear();
      this.tapNow = null;
    }
  }

  pressed(a: Action) {
    return this.pressedNow.has(a);
  }

  isHeld(a: Action) {
    return this.held.has(a);
  }

  /** 取走这一帧的点屏（取走后别的组件就拿不到了）。 */
  takeTap(): Tap | null {
    const t = this.tapNow;
    this.tapNow = null;
    return t;
  }

  peekTap(): Tap | null {
    return this.tapNow;
  }

  /** 把这一帧剩下的按键都作废。 */
  consumeAll() {
    this.pressedNow.clear();
    this.tapNow = null;
  }
}

/** 屏幕上的方向盘和按钮（触屏设备才显示）。 */
export function bindTouchPad(input: Input, pad: HTMLElement) {
  const dpad = pad.querySelector<HTMLElement>('.dpad');
  if (dpad) {
    let active: Action | null = null;
    const set = (a: Action | null) => {
      if (a === active) return;
      if (active) input.release(active);
      active = a;
      if (a) input.press(a);
      dpad.dataset.dir = a ?? '';
    };
    const fromPoint = (e: PointerEvent): Action | null => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return active;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dpad.setPointerCapture(e.pointerId);
      set(fromPoint(e));
    });
    dpad.addEventListener('pointermove', (e) => {
      if (active) set(fromPoint(e));
    });
    const end = () => set(null);
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
    dpad.addEventListener('lostpointercapture', end);
  }
  for (const btn of pad.querySelectorAll<HTMLElement>('[data-act]')) {
    const a = btn.dataset.act as Action;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('down');
      input.press(a);
    });
    const end = () => {
      btn.classList.remove('down');
      input.release(a);
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
  }
}
