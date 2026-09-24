// 原版模式的地图场景：地图、人物、对话、事件全部来自 ROM，规则照原版的走路代码（$097A 起）。
// 一格 32×32 像素，一屏 10×7 格；主角一步走 32 像素，每帧 2 像素。

import type { Game, Scene } from '../engine/game';
import { setHint } from '../engine/hint';
import { VH, VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { ORIG_SLOT_BASE, saveSlot } from '../engine/storage';
import { slotItems } from '../game/saves';
import { UiLayer } from '../engine/ui';
import type { OrigMap, RomAssets } from '../rom/assets';
import { SPRITE_FRAMES } from '../rom/assets';
import { mapEntry, mapNpcs, NPC_MASK_MAPS } from '../rom/maps';
import { applyFlagPatches } from '../rom/patches';
import { messageAddr, talkAddr, type Glyph } from '../rom/text';
import { MessageBox, type MsgLayout } from './msgbox';
import type { OrigState } from './state';
import { eventAddr, Vm, type ObjDef, type VmHost } from './vm';

/** 原版 $138E：姿势（朝向×4+步）→ 帧号。朝右用镜像帧（11–13）。 */
const ANIM_FRAMES = [3, 4, 3, 5, 0, 1, 0, 2, 6, 7, 6, 8, 11, 12, 11, 13];
const DIR_VEC = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const FRAME = 1 / 60;

interface Obj {
  sprite: number;
  /** 姿势：朝向×4（0 上 4 下 8 左 12 右），走路时加上步数 */
  anim: number;
  x: number;
  y: number;
  /** 0xFF 静止；0xFE 原地转身；其它：在范围内随便走 */
  mode: number;
  talk: number;
  box: [number, number, number, number];
  /** 正在走的目标（像素）和速度 */
  tx?: number;
  ty?: number;
  speed?: number;
  /** 走完后摆的姿势 */
  finalAnim?: number;
  /** 按格子走（op1a）：目标格 */
  cellTarget?: [number, number];
  /** 闲逛计时 */
  idle: number;
  moving: boolean;
}

export interface OrigNav {
  toTitle: () => Promise<void>;
  battle: (info: { map: number; group: number; battle: number }) => Promise<void>;
}

export class OrigField implements Scene {
  private map!: OrigMap;
  private attr!: Uint8Array;
  private width = 10;
  private height = 7;
  private objs: (Obj | null)[] = new Array(16).fill(null);
  private camX = 0;
  private camY = 0;
  private acc = 0;
  private frameNo = 0;
  private mode = 1;
  private readonly msg: MessageBox;
  private readonly vm: Vm;
  private readonly ui: UiLayer;
  private scriptBusy = false;
  private walk: { dir: number; left: number; scroll: [number, number] } | null = null;
  private waiters: { frames: number; done: () => void }[] = [];
  private moveDone: (() => void) | null = null;
  private fade = 0;
  private fadeTarget = 0;
  private fadeDone: (() => void) | null = null;
  private emotes: { slot: number; kind: number; t: number }[] = [];
  private route: [number, number][] = [];
  private routeAction: 'talk' | 'none' = 'none';
  private menuOpen = false;
  private time = 0;
  private started = false;
  /** 等当前脚本跑完再跑的事件（比如战斗结束后的剧情） */
  private queued: [number, number] | null = null;

  constructor(
    private readonly game: Game,
    private readonly assets: RomAssets,
    readonly state: OrigState,
    private readonly nav: OrigNav,
  ) {
    this.msg = new MessageBox(assets);
    this.ui = new UiLayer(game.screen.ctx);
    this.vm = new Vm(assets.rom, this.host());
  }

  enter() {
    if (this.started) return;
    this.started = true;
    this.loadCurrent(false);
    const p = this.state.pending;
    if (p) {
      this.state.pending = null;
      this.runEvent(p[0], p[1]);
    }
  }

  /** 调试用（地址加 ?debug）：直接跑事件、传送。 */
  readonly debug = {
    run: (group: number, code: number) => this.runEvent(group, code),
    warp: (map: number, entry: number) => {
      this.state.map = map;
      this.state.entry = entry;
      this.loadCurrent(true);
    },
    busy: () => this.scriptBusy || this.msg.active || this.anyMoving(),
    state: () => this.state,
  };

  /** 当前脚本结束后接着跑某个事件。 */
  queueEvent(group: number, code: number) {
    this.queued = [group, code];
  }

  // ───────── 地图 ─────────

  private get player() {
    return this.objs[0]!;
  }

  /** 按 state 里的地图、尺寸、主角位置载入。fromEntry：位置取入口表（换地图时）。 */
  private loadCurrent(fromEntry: boolean) {
    const s = this.state;
    if (fromEntry) {
      const e = mapEntry(this.assets.rom, s.entry);
      s.width = e.width;
      s.height = e.height;
      s.x = e.x;
      s.y = e.y;
      s.facing = e.facing & 3;
      s.camX = e.camX * 32;
      s.camY = e.camY * 32;
    }
    this.width = s.width;
    this.height = s.height;
    this.map = this.assets.map(s.map, s.width);
    this.attr = Uint8Array.from(this.map.data.attr);
    this.applyPatches();
    this.camX = s.camX;
    this.camY = s.camY;
    const leader = s.party[0] ?? 1;
    const keep = this.objs.slice(1, 8);
    this.objs = new Array(16).fill(null);
    this.objs[0] = { sprite: leader, anim: s.facing * 4, x: s.x, y: s.y, mode: 0xff, talk: 0, box: [0, 0, 0, 0], idle: 0, moving: false };
    // 1–7 号槽是剧情里临时放的人，换地图时原版不清（op27 才清），这里也保留
    keep.forEach((o, i) => (this.objs[i + 1] = o));
    const maskIndex = NPC_MASK_MAPS.indexOf(s.map);
    const visible = maskIndex >= 0 ? s.masks[maskIndex] : 0xffff;
    mapNpcs(this.assets.rom, s.map, visible).forEach((n, i) => {
      if (i >= 8) return;
      this.objs[8 + i] = { ...n, idle: 60 + Math.random() * 120, moving: false };
    });
    this.walk = null;
    this.route = [];
  }

  private applyPatches() {
    const g = this.state.map >> 8;
    applyFlagPatches(this.assets.rom, g, this.state.flags[g] ?? 0, this.state.map, this.attr);
  }

  private attrAt(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return 0x70;
    return this.attr[cy * this.width + cx] ?? 0x70;
  }

  private objAt(cx: number, cy: number, except?: Obj) {
    for (let i = 1; i < 16; i++) {
      const o = this.objs[i];
      if (!o || o === except || !o.sprite) continue;
      if (Math.floor(o.x / 32) === cx && Math.floor((o.y + 16) / 32) === cy) return i;
      if (o.moving && o.tx !== undefined && o.ty !== undefined && Math.floor(o.tx / 32) === cx && Math.floor(o.ty / 32) === cy) return i;
    }
    return -1;
  }

  // ───────── 事件 ─────────

  private runEvent(group: number, code: number) {
    const addr = eventAddr(this.assets.rom, group, code);
    // 空脚本（只有 FF FF）不用进入事件状态
    if (this.assets.rom.u16(addr) === 0xffff) return;
    this.scriptBusy = true;
    this.route = [];
    void this.vm
      .run(addr)
      .catch((e) => console.error('脚本出错', e))
      .finally(() => {
        this.scriptBusy = false;
        this.syncState();
      });
  }

  private layout(): MsgLayout {
    const p = this.player;
    return { top: p.y - this.camY > 96, portraitRight: p.x - this.camX <= 64 };
  }

  private host(): VmHost {
    return {
      message: (id) => this.msg.show(messageAddr(this.assets.rom, id), this.layout()),
      moveTo: (first, targets, finals) => {
        targets.forEach((t, i) => {
          const o = this.objs[first + i];
          if (!o) return;
          Object.assign(o, { tx: t.x, ty: t.y, speed: this.mode, finalAnim: finals[i], cellTarget: undefined, moving: true });
        });
        return this.waitMoves();
      },
      moveCells: (first, targets, finals) => {
        targets.forEach((t, i) => {
          const o = this.objs[first + i];
          if (!o) return;
          const s8 = (v: number) => (v & 0x80 ? v - 256 : v);
          o.cellTarget = [s8(t >> 8), s8(t & 0xff)];
          o.finalAnim = finals[i];
          o.speed = 2;
          o.moving = true;
        });
        return this.waitMoves();
      },
      face: (slot, anim) => {
        const o = this.objs[slot];
        if (o) {
          o.anim = anim;
          o.mode = 0xff;
        }
      },
      step: (dir) => {
        const p = this.player;
        p.anim = dir * 4;
        this.state.facing = dir;
        this.startStep(dir, true);
        return this.waitMoves();
      },
      setMap: (map, entry) => {
        this.state.map = map;
        this.state.entry = entry;
      },
      loadMap: async () => {
        this.loadCurrent(true);
        this.syncState();
      },
      battle: async (map) => {
        await this.nav.battle({ map, group: this.state.map >> 8, battle: this.state.battle ?? 0 });
      },
      placeObjects: (defs: ObjDef[]) => {
        for (const d of defs) {
          if (d.slot === 0) {
            Object.assign(this.player, { sprite: d.sprite || this.player.sprite, anim: d.anim, x: d.x, y: d.y });
            continue;
          }
          this.objs[d.slot] = { sprite: d.sprite, anim: d.anim, x: d.x, y: d.y, mode: d.mode, talk: d.talk, box: [0, 0, 0, 0], idle: 120, moving: false };
        }
      },
      removeObject: (slot) => {
        if (slot > 0) this.objs[slot] = null;
        else this.player.sprite = 0;
      },
      clearObjects: () => {
        for (let i = 1; i < 16; i++) this.objs[i] = null;
        this.player.sprite = 0;
      },
      setObjectPos: (slot, x, y) => {
        const o = this.objs[slot];
        if (o) {
          o.x = x;
          o.y = y;
        }
      },
      setFlag: (group, bit, on) => {
        const f = this.state.flags;
        f[group] = on ? (f[group] | (1 << bit)) >>> 0 : (f[group] & ~(1 << bit)) >>> 0;
        if (group === this.state.map >> 8) {
          this.attr = Uint8Array.from(this.map.data.attr);
          this.applyPatches();
        }
      },
      join: (id) => {
        if (!this.state.party.includes(id)) this.state.party.push(id);
      },
      advanceTalk: (id) => {
        this.state.talk[id] = (this.state.talk[id] ?? 0) + 1;
      },
      setRegion: (i, v) => {
        this.state.regions[i] = v;
      },
      setBattle: (id) => {
        this.state.battle = id;
      },
      wait: (frames) => new Promise((done) => this.waiters.push({ frames, done })),
      fadeOut: () => this.fadeTo(1),
      fadeIn: () => this.fadeTo(0),
      setMode: (m) => {
        this.mode = Math.max(1, Math.min(4, m));
      },
      emote: (kind, slots) => {
        for (const slot of slots) this.emotes.push({ slot, kind, t: 0 });
        return new Promise((done) => this.waiters.push({ frames: 48, done }));
      },
      search: (item) => this.showFound(item),
      worldMap: async () => 0,
      sound: () => {},
      doorAnim: () => new Promise((done) => this.waiters.push({ frames: 12, done })),
      unknown: (op, at) => console.warn(`还没实现的脚本指令 ${op.toString(16)} @ ${at.toString(16)}`),
    };
  }

  private waitMoves() {
    return new Promise<void>((resolve) => {
      if (!this.anyMoving()) resolve();
      else this.moveDone = resolve;
    });
  }

  private anyMoving() {
    return this.walk !== null || this.objs.some((o) => o?.moving);
  }

  private fadeTo(target: number) {
    return new Promise<void>((resolve) => {
      this.fadeTarget = target;
      this.fadeDone = resolve;
    });
  }

  /** 调查结果：获得钱或道具（原版 $1AA80 / $1AADA）。 */
  private async showFound(item: number) {
    const rom = this.assets.rom;
    const short = (a: number) => {
      const out: Glyph[] = [];
      let bank = 0;
      for (let i = 0; i < 40 && rom.u8(a) !== 0xff; i++, a++) {
        const c = rom.u8(a);
        if (c >= 0xf0) bank = c - 0xf0;
        else out.push({ bank, code: c, red: false });
      }
      return out;
    };
    const sys = (i: number) => short(rom.u32(0x1a6fc + i * 4));
    let line: Glyph[];
    if (item > 0xff) {
      const i = item & 0xff;
      line = sys(i);
      this.state.money += rom.u32(0x1aab2 + i * 4);
    } else {
      const name = short(0xad17c + rom.u16(0xad17c + item * 2));
      line = [...sys(10), ...name.map((g) => ({ ...g, red: true }))];
      const it = this.state.items.find((x) => x.id === item);
      if (it) it.n++;
      else this.state.items.push({ id: item, n: 1 });
    }
    sfx.item();
    await this.msg.showGlyphs([line], this.layout());
  }

  // ───────── 走路 ─────────

  /** 主角朝 dir 走一步（原版 $0A1C 起那几段）。script：剧情里强制走，不查碰撞。 */
  private startStep(dir: number, script = false) {
    const p = this.player;
    p.anim = dir * 4;
    this.state.facing = dir;
    const cx = Math.floor(p.x / 32);
    const cy = Math.floor(p.y / 32);
    const nx = cx + DIR_VEC[dir][0];
    const ny = cy + DIR_VEC[dir][1];
    if (!script) {
      const a = this.attrAt(nx, ny);
      if (a > 0x4f) {
        if (a >= 0x51 && a <= 0x7f) this.runEvent(this.state.map >> 8, a);
        return false;
      }
      if (this.objAt(nx, ny) >= 0) return false;
    }
    // 镜头：主角尽量待在 x=128~160、y=96，地图边上镜头不动
    const sx = p.x - this.camX;
    const sy = p.y - this.camY;
    let scroll: [number, number] = [0, 0];
    if (dir === 3 && sx >= 160 && this.camX < (this.width - 10) * 32) scroll = [1, 0];
    if (dir === 2 && sx <= 128 && this.camX > 0) scroll = [-1, 0];
    if (dir === 0 && sy <= 96 && this.camY > 0) scroll = [0, -1];
    if (dir === 1 && sy >= 96 && this.camY < (this.height - 7) * 32) scroll = [0, 1];
    this.walk = { dir, left: 32, scroll };
    p.moving = true;
    return true;
  }

  private finishStep() {
    const p = this.player;
    p.moving = false;
    this.walk = null;
    this.syncState();
    if (this.scriptBusy) return;
    const a = this.attrAt(Math.floor(p.x / 32), Math.floor(p.y / 32));
    if (a >= 0x01 && a <= 0x4f) this.runEvent(this.state.map >> 8, a);
  }

  private interact() {
    const p = this.player;
    const dir = this.state.facing;
    const nx = Math.floor(p.x / 32) + DIR_VEC[dir][0];
    const ny = Math.floor(p.y / 32) + DIR_VEC[dir][1];
    const a = this.attrAt(nx, ny);
    if (a >= 0x80 && a <= 0xaf) {
      this.runEvent(this.state.map >> 8, a);
      return;
    }
    const i = this.objAt(nx, ny);
    if (i >= 8) void this.talkTo(i);
  }

  /** 跟 NPC 说话（原版 $182AA）：NPC 转过来，按对话号和剧情进度查消息，头像用 NPC 的人物号。 */
  private async talkTo(slot: number) {
    const o = this.objs[slot];
    if (!o || !o.talk) return;
    const opposite = [4, 0, 12, 8][this.state.facing];
    const savedAnim = o.anim;
    const savedMode = o.mode;
    o.anim = opposite;
    o.mode = 0xff;
    this.scriptBusy = true;
    try {
      const addr = talkAddr(this.assets.rom, o.talk, this.state.talk[o.talk] ?? 0);
      await this.msg.show(addr, this.layout(), o.sprite);
    } finally {
      this.scriptBusy = false;
      if (savedMode !== 0xff) {
        o.anim = savedAnim;
        o.mode = savedMode;
      }
    }
  }

  private syncState() {
    const p = this.player;
    const s = this.state;
    s.x = p.x;
    s.y = p.y;
    s.camX = this.camX;
    s.camY = this.camY;
  }

  // ───────── 每帧 ─────────

  update(dt: number) {
    this.time += dt;
    this.state.time += dt;
    const input = this.game.input;
    if (this.queued && !this.scriptBusy && !this.msg.active) {
      const [g, c] = this.queued;
      this.queued = null;
      this.runEvent(g, c);
    }
    this.ui.update(dt, input);
    if (this.ui.busy()) {
      setHint(this.ui.modalHint() ?? '');
      return;
    }
    if (this.msg.active) {
      this.msg.update(dt, input);
      setHint('点屏幕或按 A 继续');
    } else if (!this.scriptBusy && !this.walk) {
      this.handleInput();
      setHint('方向键走路，A 调查、说话，也可以直接点地图；「菜单」存档');
    } else {
      setHint('');
    }
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.tick();
    }
  }

  private handleInput() {
    const input = this.game.input;
    if (input.pressed('menu')) {
      void this.openMenu();
      return;
    }
    if (input.pressed('ok')) {
      this.route = [];
      this.interact();
      return;
    }
    const tap = input.takeTap();
    if (tap) {
      this.onTap(tap.x, tap.y);
      return;
    }
    const dirs: [string, number][] = [
      ['up', 0],
      ['down', 1],
      ['left', 2],
      ['right', 3],
    ];
    for (const [name, d] of dirs) {
      if (input.isHeld(name as 'up') || input.pressed(name as 'up')) {
        this.route = [];
        this.startStep(d);
        return;
      }
    }
    if (this.route.length) this.followRoute();
  }

  /** 点地图：走过去；点人：走到旁边说话；点柜子之类：走到旁边调查。 */
  private onTap(x: number, y: number) {
    const cx = Math.floor((x + this.camX) / 32);
    const cy = Math.floor((y + this.camY) / 32);
    const npc = this.objAt(cx, cy);
    const a = this.attrAt(cx, cy);
    const target = npc >= 0 || a >= 0x50;
    const path = this.findPath([cx, cy], target);
    if (!path) return;
    this.route = path;
    this.routeAction = target ? 'talk' : 'none';
    this.followRoute();
  }

  private followRoute() {
    const p = this.player;
    const cx = Math.floor(p.x / 32);
    const cy = Math.floor(p.y / 32);
    const next = this.route[0];
    if (!next) return;
    const d = next[0] > cx ? 3 : next[0] < cx ? 2 : next[1] > cy ? 1 : 0;
    if (this.route.length === 1 && this.routeAction === 'talk') {
      this.route = [];
      p.anim = d * 4;
      this.state.facing = d;
      // 门这类「撞上去触发」的格子就往里走一步，其它的按 A
      const a = this.attrAt(next[0], next[1]);
      if (a >= 0x51 && a <= 0x7f && this.objAt(next[0], next[1]) < 0) this.startStep(d);
      else this.interact();
      return;
    }
    this.route.shift();
    if (!this.startStep(d)) this.route = [];
  }

  /** 广度优先找路；toBlocked：终点本身不能走（人、柜子），走到它旁边。 */
  private findPath(goal: [number, number], toBlocked: boolean): [number, number][] | null {
    const p = this.player;
    const start: [number, number] = [Math.floor(p.x / 32), Math.floor(p.y / 32)];
    const key = (c: [number, number]) => c[1] * 256 + c[0];
    const prev = new Map<number, [number, number] | null>([[key(start), null]]);
    const queue: [number, number][] = [start];
    let found: [number, number] | null = null;
    while (queue.length) {
      const c = queue.shift()!;
      if (c[0] === goal[0] && c[1] === goal[1]) {
        found = c;
        break;
      }
      for (const [dx, dy] of DIR_VEC) {
        const n: [number, number] = [c[0] + dx, c[1] + dy];
        if (prev.has(key(n))) continue;
        const isGoal = n[0] === goal[0] && n[1] === goal[1];
        const free = this.attrAt(n[0], n[1]) <= 0x4f && this.objAt(n[0], n[1]) < 0;
        if (!free && !(isGoal && toBlocked)) continue;
        prev.set(key(n), c);
        queue.push(n);
      }
    }
    if (!found) return null;
    const out: [number, number][] = [];
    for (let c: [number, number] | null = found; c && key(c) !== key(start); c = prev.get(key(c)) ?? null) out.unshift(c);
    return out;
  }

  private tick() {
    this.frameNo++;
    // 淡入淡出
    if (this.fade !== this.fadeTarget) {
      this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + 1 / 16) : Math.max(this.fadeTarget, this.fade - 1 / 16);
      if (this.fade === this.fadeTarget && this.fadeDone) {
        const d = this.fadeDone;
        this.fadeDone = null;
        d();
      }
    }
    // 等待
    for (const w of this.waiters) w.frames--;
    const ready = this.waiters.filter((w) => w.frames <= 0);
    this.waiters = this.waiters.filter((w) => w.frames > 0);
    ready.forEach((w) => w.done());
    this.emotes = this.emotes.filter((e) => ++e.t < 48);
    // 主角走一步
    if (this.walk) {
      const p = this.player;
      const [dx, dy] = DIR_VEC[this.walk.dir];
      p.x += dx * 2;
      p.y += dy * 2;
      this.camX += this.walk.scroll[0] * 2;
      this.camY += this.walk.scroll[1] * 2;
      p.anim = this.walk.dir * 4 + (Math.floor((32 - this.walk.left) / 8) & 3);
      this.walk.left -= 2;
      if (this.walk.left <= 0) {
        p.anim = this.walk.dir * 4;
        this.finishStep();
      }
    }
    // 剧情里的移动
    for (let i = 0; i < 16; i++) {
      const o = this.objs[i];
      if (!o || !o.moving || (i === 0 && this.walk)) continue;
      if (o.cellTarget) this.stepCell(o);
      else if (o.tx !== undefined && o.ty !== undefined) this.stepLine(o);
    }
    // 闲逛的 NPC
    if (!this.scriptBusy) for (let i = 8; i < 16; i++) this.wander(this.objs[i]);
    if (this.moveDone && !this.anyMoving()) {
      const d = this.moveDone;
      this.moveDone = null;
      d();
    }
  }

  /** op19：沿直线走到像素位置（可以斜着走），每帧 speed 像素。 */
  private stepLine(o: Obj) {
    const dx = o.tx! - o.x;
    const dy = o.ty! - o.y;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist === 0) {
      o.moving = false;
      o.anim = o.finalAnim ?? o.anim;
      o.mode = 0xff;
      o.tx = o.ty = undefined;
      return;
    }
    const sp = Math.min(o.speed ?? 1, dist);
    o.x += Math.round((dx / dist) * sp);
    o.y += Math.round((dy / dist) * sp);
    if (Math.abs(o.tx! - o.x) < 1 && Math.abs(o.ty! - o.y) < 1) {
      o.x = o.tx!;
      o.y = o.ty!;
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 1 : 0;
    o.anim = dir * 4 + (Math.floor(this.frameNo / (16 / Math.max(1, this.mode))) & 3);
  }

  /** op1a：按格子走，先横后竖，每步 32 像素。目标 -1 表示走出地图。 */
  private stepCell(o: Obj) {
    const [tx, ty] = o.cellTarget!;
    const cx = Math.floor(o.x / 32);
    const cy = Math.floor(o.y / 32);
    if (o.x % 32 === 0 && o.y % 32 === 0 && cx === tx && cy === ty) {
      o.moving = false;
      o.cellTarget = undefined;
      o.anim = o.finalAnim ?? o.anim;
      o.mode = 0xff;
      return;
    }
    // 走到格子中间再决定方向
    let dir: number;
    if (o.x % 32 !== 0) dir = (o.anim >> 2) === 2 ? 2 : 3;
    else if (o.y % 32 !== 0) dir = (o.anim >> 2) === 0 ? 0 : 1;
    else if (cx !== tx) dir = cx > tx ? 2 : 3;
    else dir = cy > ty ? 0 : 1;
    o.x += DIR_VEC[dir][0] * 2;
    o.y += DIR_VEC[dir][1] * 2;
    o.anim = dir * 4 + (Math.floor(this.frameNo / 8) & 3);
    // 走出地图外就算到了
    if (o.x < -64 || o.y < -64 || o.x > this.width * 32 + 32 || o.y > this.height * 32 + 32) {
      o.moving = false;
      o.cellTarget = undefined;
    }
  }

  private wander(o: Obj | null) {
    if (!o || o.moving || o.mode === 0xff) return;
    if (--o.idle > 0) return;
    o.idle = 90 + Math.floor(Math.random() * 150);
    if (o.mode === 0xfe) {
      o.anim = Math.floor(Math.random() * 4) * 4;
      return;
    }
    const dir = Math.floor(Math.random() * 4);
    const nx = Math.floor(o.x / 32) + DIR_VEC[dir][0];
    const ny = Math.floor(o.y / 32) + DIR_VEC[dir][1];
    const [x1, y1, x2, y2] = o.box;
    const inBox = nx * 32 >= x1 && nx * 32 <= x2 && ny * 32 >= y1 && ny * 32 <= y2;
    const p = this.player;
    const hitsPlayer = nx === Math.floor(p.x / 32) && ny === Math.floor(p.y / 32);
    const walkTarget = this.walk ? [Math.floor(p.x / 32) + DIR_VEC[this.walk.dir][0], Math.floor(p.y / 32) + DIR_VEC[this.walk.dir][1]] : null;
    const hitsWalk = walkTarget && walkTarget[0] === nx && walkTarget[1] === ny;
    o.anim = dir * 4;
    if (!inBox || hitsPlayer || hitsWalk || this.attrAt(nx, ny) > 0x4f || this.objAt(nx, ny, o) >= 0) return;
    Object.assign(o, { tx: nx * 32, ty: ny * 32, speed: 1, finalAnim: dir * 4, moving: true });
  }

  // ───────── 菜单 ─────────

  private async openMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    try {
      const i = await this.ui.choose(
        [
          { label: '存档', enabled: true },
          { label: '回到标题', enabled: true },
          { label: '返回游戏', enabled: true },
        ],
        { title: `队伍 ${this.state.party.length} 人 · 银两 ${this.state.money}` },
      );
      if (i === 0) {
        const slot = await this.ui.choose(slotItems(0, false, ORIG_SLOT_BASE), { title: '存到哪里？', width: 280 });
        if (slot < 0) return;
        this.save(slot);
      } else if (i === 1) {
        await this.nav.toTitle();
      }
    } finally {
      this.menuOpen = false;
    }
  }

  /** 存档（slot 是 0–3，实际存到原版模式的存档位）。 */
  save(slot: number) {
    this.syncState();
    const place = placeName(this.state.map);
    const ok = saveSlot(ORIG_SLOT_BASE + slot, { chapter: '原版剧情', place, playTime: this.state.time }, this.state);
    this.ui.toast(ok ? '已存档' : '存档失败', 2);
  }

  // ───────── 画面 ─────────

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    const cx = Math.round(this.camX);
    const cy = Math.round(this.camY);
    ctx.drawImage(this.map.low, -cx, -cy);
    const order = this.objs.map((o, i) => ({ o, i })).filter((e) => e.o && e.o.sprite) as { o: Obj; i: number }[];
    order.sort((a, b) => a.o.y - b.o.y || a.i - b.i);
    for (const { o } of order) this.drawObj(ctx, o, cx, cy);
    if (this.map.high) ctx.drawImage(this.map.high, -cx, -cy);
    for (const e of this.emotes) {
      const o = this.objs[e.slot];
      if (!o) continue;
      this.drawEmote(ctx, e.kind, o.x - cx + 16, o.y - cy - 4 - Math.min(6, e.t / 2));
    }
    this.msg.draw(ctx, this.time);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    this.ui.draw(ctx);
  }

  private drawObj(ctx: CanvasRenderingContext2D, o: Obj, cx: number, cy: number) {
    const sheet = this.assets.spriteSheet(o.sprite);
    const a = o.anim & 0x1f;
    let f = a < 16 ? ANIM_FRAMES[a] : Math.min(10, 9 + (a & 1));
    if (o.mode !== 0xff && !o.moving && a < 16) f = ANIM_FRAMES[a & ~3];
    f = Math.max(0, Math.min(SPRITE_FRAMES - 1, f));
    ctx.drawImage(sheet, f * 32, 0, 32, 32, Math.round(o.x - cx), Math.round(o.y - cy), 32, 32);
  }

  /** 头上的表情：op2e 感叹号、op2f 问号、op30 汗。先用简单图形代替原版的图。 */
  private drawEmote(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number) {
    const ch = kind === 0x2e ? '!' : kind === 0x2f ? '?' : '…';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y - 6, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kind === 0x2e ? '#c00' : '#000';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y - 6);
  }
}

/** 存档列表里显示的地点（还没有从 ROM 里找到地名表，先按组写） */
function placeName(map: number) {
  const g = map >> 8;
  if (g === 1) return (map & 0xff) === 0 ? '郓城县' : '郓城县 · 屋内';
  return `第 ${g} 区`;
}
