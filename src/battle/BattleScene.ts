import { drawBrush, brushWidth } from '../art/brush';
import { charSprite, charSpriteFlash, charSpriteGray, type Facing } from '../art/characters';
import { TILE, renderMap } from '../art/tiles';
import type { BattleDef } from '../data/battles';
import { lookOf } from '../data/characters';
import { CLASSES } from '../data/classes';
import { ITEMS, countItem, type Inventory, type ItemId } from '../data/items';
import { terrainName } from '../data/terrain';
import { wait, type Game, type Scene } from '../engine/game';
import { setHint, type HintButton } from '../engine/hint';
import type { Input, Tap } from '../engine/input';
import type { Pt } from '../engine/path';
import { mulberry32, randomSeed } from '../engine/rng';
import { VH, VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { saveSettings, settings } from '../engine/storage';
import { drawText } from '../engine/text';
import { UiLayer, drawBar, drawWindow, type MenuItem } from '../engine/ui';
import type { GameState } from '../game/state';
import type { BattleHooks, BattleTalk } from '../story/api';
import { SPEAKERS } from '../story/speakers';
import { planEnemy } from './ai';
import { Battle, type AttackResult, type BattleUnit, type ExpEvent, type Reach } from './battle';
import { inRange } from './rules';

type Mode = 'busy' | 'idle' | 'move' | 'target' | 'end';
type TargetKind = 'attack' | 'heal' | 'item';

interface Tween {
  t: number;
  dur: number;
  fn: (p: number) => void;
  done: () => void;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

const STEP_MS = 70;

export class BattleScene implements Scene {
  private readonly battle: Battle;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly ui: UiLayer;
  private readonly invSnapshot: Inventory;
  private mode: Mode = 'busy';
  private cursor: Pt = { x: 0, y: 0 };
  private cam = { x: 0, y: 0 };
  private sel: BattleUnit | null = null;
  private origin: Pt | null = null;
  private reach: Reach | null = null;
  private targets: BattleUnit[] = [];
  private targetIdx = 0;
  private targetKind: TargetKind = 'attack';
  private pendingItem: ItemId | null = null;
  private danger: { unit: BattleUnit; tiles: Set<number> } | null = null;
  /** 选中人物后：从能走到的格子出发还能打到的范围（红色） */
  private attackPreview: Set<number> | null = null;
  private menuOpen: 'action' | 'battle' | null = null;
  private bossWoken = false;
  private t = 0;
  private tweens: Tween[] = [];
  private popups: Popup[] = [];
  private banner: { text: string; color: string; t: number; dur: number } | null = null;
  private readonly pixelPos = new Map<number, Pt>();
  private readonly facing = new Map<number, Facing>();
  private readonly flashUntil = new Map<number, number>();
  private readonly alpha = new Map<number, number>();
  private readonly hpShown = new Map<number, number>();
  private readonly dying = new Set<number>();
  private readonly talk: BattleTalk;

  constructor(
    private readonly game: Game,
    private readonly def: BattleDef,
    private readonly state: GameState,
    private readonly hooks: BattleHooks,
    private readonly onEnd: (result: 'win' | 'lose') => void,
    private readonly retry = false,
  ) {
    this.invSnapshot = { ...state.inv };
    this.battle = new Battle(def, state.party, state.inv, mulberry32(randomSeed()));
    this.mapCanvas = renderMap(this.battle.tiles);
    this.ui = new UiLayer(game.screen.ctx);
    const leader = this.battle.units.find((u) => u.leader) ?? this.battle.units[0];
    this.cursor = { x: leader.x, y: leader.y };
    this.snapCamera();
    this.talk = {
      say: (who, text) => {
        const s = SPEAKERS[who];
        return this.ui.say(s?.name ?? who, text, s ? charSprite(lookOf(s.look)) : null);
      },
      msg: (text) => this.ui.say(null, text),
    };
  }

  enter() {
    void this.intro();
  }

  // ───────── 流程 ─────────

  private async intro() {
    this.mode = 'busy';
    await this.showConditions();
    if (!this.retry && this.hooks.onStart) await this.hooks.onStart(this.talk);
    await this.showBanner('我军回合', '#cfe4ff');
    this.mode = 'idle';
  }

  private showConditions() {
    return this.ui.panel((ctx) => {
      const w = 208;
      const h = 86;
      const x = (VW - w) / 2;
      const y = (VH - h) / 2 - 10;
      drawWindow(ctx, x, y, w, h);
      const tw = brushWidth(this.def.name, 20);
      drawBrush(ctx, this.def.name, (VW - tw) / 2, y + 6, 20, { fill: '#ffe070', outline: '#3a1a08', outlineWidth: 2 });
      drawText(ctx, '胜利条件', x + 14, y + 36, { color: '#8fd0ff' });
      drawText(ctx, this.def.winText, x + 74, y + 36);
      drawText(ctx, '失败条件', x + 14, y + 56, { color: '#ff9a8a' });
      drawText(ctx, this.def.loseText, x + 74, y + 56);
    });
  }

  private showBanner(text: string, color: string, seconds = 1.1) {
    this.banner = { text, color, t: 0, dur: seconds };
    return this.tween(seconds * 1000, (p) => {
      if (this.banner) this.banner.t = p * seconds;
    }).then(() => {
      this.banner = null;
    });
  }

  private async enemyPhase() {
    this.mode = 'busy';
    this.danger = null;
    this.battle.beginPhase('enemy');
    await this.showBanner('敌军回合', '#ffb0a0');
    for (const e of this.battle.units.filter((u) => u.side === 'enemy')) {
      if (!e.alive) continue;
      const wasHolding = e.ai === 'hold';
      const plan = planEnemy(this.battle, e);
      if (wasHolding && e.ai === 'aggressive' && e.boss && !this.bossWoken) {
        this.bossWoken = true;
        this.cursor = { x: e.x, y: e.y };
        if (this.hooks.onBossWake) await this.hooks.onBossWake(this.talk);
      }
      const moves = plan.path.length > 1;
      if (moves || plan.target) {
        this.cursor = { x: e.x, y: e.y };
        await wait(160);
      }
      if (moves) {
        await this.animateMove(e, plan.path);
        const end = plan.path[plan.path.length - 1];
        this.battle.move(e, end.x, end.y);
        this.cursor = { ...end };
      }
      if (plan.target?.alive) {
        await wait(120);
        await this.playAttack(this.battle.attack(e, plan.target));
      }
      e.acted = true;
      if (await this.checkOutcome()) return;
    }
    this.battle.beginPhase('player');
    await this.showBanner('我军回合', '#cfe4ff');
    const next = this.battle.units.find((u) => u.side === 'player' && u.alive);
    if (next) this.cursor = { x: next.x, y: next.y };
    this.mode = 'idle';
  }

  private async finishAction(u: BattleUnit) {
    u.acted = true;
    this.sel = null;
    this.targets = [];
    this.pendingItem = null;
    if (await this.checkOutcome()) return;
    if (this.battle.allActed('player')) {
      await wait(250);
      await this.enemyPhase();
    } else {
      this.mode = 'idle';
    }
  }

  private async checkOutcome(): Promise<boolean> {
    const o = this.battle.outcome();
    if (!o) return false;
    this.mode = 'end';
    if (o === 'win') {
      sfx.win();
      await this.showBanner('胜利', '#ffe070', 2);
      this.battle.syncParty();
      this.onEnd('win');
      return true;
    }
    sfx.lose();
    await this.showBanner('败北', '#b0b0b8', 2);
    for (const k of Object.keys(this.state.inv) as ItemId[]) delete this.state.inv[k];
    Object.assign(this.state.inv, this.invSnapshot);
    const i = await this.ui.ask(null, '胜败乃兵家常事。要重新挑战吗？', ['重新挑战', '回到标题'], null, false);
    if (i === 0) void this.game.switchTo(new BattleScene(this.game, this.def, this.state, this.hooks, this.onEnd, true));
    else this.onEnd('lose');
    return true;
  }

  // ───────── 我方操作 ─────────

  update(dt: number) {
    this.t += dt;
    this.stepTweens(dt);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1);
    const input = this.game.input;
    const uiBusy = this.ui.update(dt, input);
    this.followCamera(dt);
    this.updateHint(uiBusy);
    if (uiBusy) return;
    if (this.mode === 'idle') this.updateIdle(input);
    else if (this.mode === 'move') this.updateMove(input);
    else if (this.mode === 'target') this.updateTarget(input);
  }

  private moveCursor(input: Input) {
    const dirs: [string, number, number][] = [
      ['up', 0, -1],
      ['down', 0, 1],
      ['left', -1, 0],
      ['right', 1, 0],
    ];
    for (const [a, dx, dy] of dirs) {
      if (!input.pressed(a as 'up')) continue;
      const x = Math.max(0, Math.min(this.battle.w - 1, this.cursor.x + dx));
      const y = Math.max(0, Math.min(this.battle.h - 1, this.cursor.y + dy));
      if (x !== this.cursor.x || y !== this.cursor.y) {
        this.cursor = { x, y };
        sfx.cursor();
      }
    }
  }

  private tapTile(tap: Tap): Pt | null {
    const x = Math.floor((tap.x + this.cam.x) / TILE);
    const y = Math.floor((tap.y + this.cam.y) / TILE);
    return this.battle.inBounds(x, y) ? { x, y } : null;
  }

  private updateIdle(input: Input) {
    this.moveCursor(input);
    const tap = input.takeTap();
    if (tap) {
      const p = this.tapTile(tap);
      if (!p) return;
      this.cursor = p;
      const u = this.battle.unitAt(p.x, p.y);
      // 点空地只移动光标（看地形），不弹菜单；结束回合用提示栏的按钮
      if (u && (u.side === 'enemy' || !u.acted)) this.selectAtCursor();
      else if (u) this.ui.toast(`${u.name}这回合已经行动过了`);
      else if (this.danger) this.danger = null;
      return;
    }
    if (input.pressed('ok')) this.selectAtCursor();
    else if (input.pressed('cancel') && this.danger) {
      this.danger = null;
      sfx.cancel();
    } else if (input.pressed('menu')) void this.battleMenu();
  }

  private selectAtCursor() {
    const u = this.battle.unitAt(this.cursor.x, this.cursor.y);
    if (u && u.side === 'player' && !u.acted) {
      sfx.ok();
      this.sel = u;
      this.origin = { x: u.x, y: u.y };
      this.reach = this.battle.reach(u);
      this.attackPreview = this.attackArea(u, this.reach);
      this.danger = null;
      this.mode = 'move';
      return;
    }
    if (u && u.side === 'enemy') {
      sfx.ok();
      this.danger = this.danger?.unit === u ? null : { unit: u, tiles: this.threatTiles(u) };
      return;
    }
    void this.battleMenu();
  }

  /** 从能走到的格子出发还能打到、但走不到的格子。 */
  private attackArea(u: BattleUnit, reach: Reach) {
    const out = new Set<number>();
    const range = CLASSES[u.cls].range;
    const w = this.battle.w;
    for (const o of reach.tiles) {
      for (let dy = -range.max; dy <= range.max; dy++) {
        for (let dx = -range.max; dx <= range.max; dx++) {
          const x = o.x + dx;
          const y = o.y + dy;
          if (this.battle.inBounds(x, y) && inRange(range, dx, dy)) out.add(y * w + x);
        }
      }
    }
    for (const t of reach.tiles) out.delete(t.y * w + t.x);
    return out;
  }

  /** 点了红色范围里的敌人：挑一个能打到它的落脚点（少挨反击、地形好、少走路）。 */
  private approachTile(u: BattleUnit, target: BattleUnit): Pt | null {
    const reach = this.reach;
    if (!reach) return null;
    const range = CLASSES[u.cls].range;
    let best: { p: Pt; score: number } | null = null;
    for (const t of reach.tiles) {
      if (!inRange(range, target.x - t.x, target.y - t.y)) continue;
      const fc = this.battle.forecast(u, target, t.x, t.y);
      const terr = this.battle.terrain(t.x, t.y);
      const cost = reach.nodes.get(t.y * this.battle.w + t.x)?.cost ?? 0;
      const score = -(fc.counter ? (fc.counter.dmg * fc.counter.hit) / 100 : 0) + (terr?.def ?? 0) * 20 + (terr?.eva ?? 0) * 0.3 - cost * 0.5;
      if (!best || score > best.score) best = { p: t, score };
    }
    return best?.p ?? null;
  }

  private async moveThenAttack(target: BattleUnit, spot: Pt) {
    const u = this.sel!;
    this.mode = 'busy';
    sfx.ok();
    const path = this.battle.pathTo(this.reach!, spot.x, spot.y);
    this.reach = null;
    this.attackPreview = null;
    if (path.length > 1) await this.animateMove(u, path);
    this.battle.move(u, spot.x, spot.y);
    const targets = this.battle.targetsFrom(u, u.x, u.y);
    this.beginTargeting('attack', targets);
    this.targetIdx = Math.max(0, this.targets.indexOf(target));
    this.cursor = { x: target.x, y: target.y };
  }

  /** 提示栏：随时告诉玩家下一步该做什么。 */
  private updateHint(uiBusy: boolean) {
    let text = '';
    let button: HintButton | null = null;
    if (this.menuOpen === 'action') text = '选行动：「攻击」打旁边的敌人，「待机」结束这个人本回合的行动；B 退回重新走';
    else if (this.menuOpen === 'battle') text = '战斗菜单';
    else if (uiBusy) text = this.ui.modalHint() ?? '';
    else if (this.mode === 'idle') {
      const ready = this.battle.units.filter((u) => u.side === 'player' && u.alive && !u.acted).length;
      text = this.danger
        ? `红色是${this.danger.unit.name}下回合能打到的范围，再点它一次关闭`
        : `我方回合：点头上有黄箭头的人物行动（还剩 ${ready} 人）。点敌人能看它的攻击范围`;
      button = { label: '结束回合', onClick: () => this.requestEndTurn() };
    } else if (this.mode === 'move') text = '点蓝格走过去；点红色范围里的敌人会自动走过去打；点人物自己原地行动；B 取消';
    else if (this.mode === 'target') text = this.targetKind === 'attack' ? '点红框里的敌人看伤害预测，再点一次同一个敌人就出手；B 返回' : '点绿框里的同伴使用；B 返回';
    else if (this.battle.phase === 'enemy' && this.mode === 'busy') text = '敌军行动中……';
    setHint(text, button);
  }

  private requestEndTurn() {
    if (this.mode !== 'idle' || this.ui.busy()) return;
    sfx.ok();
    this.danger = null;
    this.mode = 'busy';
    void this.enemyPhase();
  }

  /** 敌人下回合能打到的所有格子（点敌人时显示成红色）。 */
  private threatTiles(u: BattleUnit) {
    const out = new Set<number>();
    const range = CLASSES[u.cls].range;
    const origins = u.ai === 'hold' ? [{ x: u.x, y: u.y }] : this.battle.reach(u).tiles;
    for (const o of origins) {
      for (let dy = -range.max; dy <= range.max; dy++) {
        for (let dx = -range.max; dx <= range.max; dx++) {
          if (this.battle.inBounds(o.x + dx, o.y + dy) && inRange(range, dx, dy)) out.add((o.y + dy) * this.battle.w + o.x + dx);
        }
      }
    }
    return out;
  }

  private updateMove(input: Input) {
    this.moveCursor(input);
    const reach = this.reach!;
    const tap = input.takeTap();
    if (tap) {
      const p = this.tapTile(tap);
      if (p && reach.canStop(p.x, p.y)) {
        this.cursor = p;
        void this.confirmMove();
      } else if (p && this.tryApproach(p)) {
        // 已经自动走过去准备攻击
      } else {
        this.cancelMove();
      }
      return;
    }
    if (input.pressed('ok')) {
      if (reach.canStop(this.cursor.x, this.cursor.y)) void this.confirmMove();
      else if (!this.tryApproach(this.cursor)) sfx.cancel();
    } else if (input.pressed('cancel')) {
      this.cancelMove();
    }
  }

  private tryApproach(p: Pt) {
    const enemy = this.battle.unitAt(p.x, p.y);
    if (!enemy || enemy.side !== 'enemy' || !this.sel) return false;
    const spot = this.approachTile(this.sel, enemy);
    if (!spot) return false;
    void this.moveThenAttack(enemy, spot);
    return true;
  }

  private cancelMove() {
    sfx.cancel();
    if (this.sel) this.cursor = { x: this.sel.x, y: this.sel.y };
    this.sel = null;
    this.reach = null;
    this.attackPreview = null;
    this.mode = 'idle';
  }

  private async confirmMove() {
    const u = this.sel!;
    this.mode = 'busy';
    sfx.ok();
    const path = this.battle.pathTo(this.reach!, this.cursor.x, this.cursor.y);
    this.reach = null;
    this.attackPreview = null;
    if (path.length > 1) await this.animateMove(u, path);
    this.battle.move(u, this.cursor.x, this.cursor.y);
    await this.actionMenu();
  }

  private usableItems(): ItemId[] {
    return (Object.keys(this.state.inv) as ItemId[]).filter((id) => ITEMS[id].kind === 'use' && countItem(this.state.inv, id) > 0);
  }

  private async actionMenu(): Promise<void> {
    const u = this.sel!;
    const attackTargets = this.battle.targetsFrom(u, u.x, u.y);
    const healTargets = this.battle.healTargetsFrom(u, u.x, u.y);
    const items: MenuItem[] = [{ label: '攻击', enabled: attackTargets.length > 0 }];
    if (CLASSES[u.cls].heal) items.push({ label: '治疗', enabled: healTargets.length > 0 });
    items.push({ label: '道具', enabled: this.usableItems().length > 0 }, { label: '待机' });
    const sx = u.x * TILE - this.cam.x;
    const sy = u.y * TILE - this.cam.y;
    const x = sx > VW / 2 ? sx - 76 : sx + 22;
    this.menuOpen = 'action';
    const i = await this.ui.choose(items, { x, y: sy - 20, width: 66 });
    this.menuOpen = null;
    const choice = i < 0 ? '取消' : items[i].label;
    if (choice === '攻击') return this.beginTargeting('attack', attackTargets);
    if (choice === '治疗') return this.beginTargeting('heal', healTargets);
    if (choice === '道具') {
      const list = this.usableItems();
      const j = await this.ui.choose(
        list.map((id) => ({ label: ITEMS[id].name, right: `×${countItem(this.state.inv, id)}` })),
        { x, y: sy - 20, title: '道具' },
      );
      if (j < 0) return this.actionMenu();
      const targets = this.battle.itemTargetsFrom(u, u.x, u.y).filter((t) => t.hp < t.maxHp);
      if (!targets.length) {
        this.ui.toast('身边没有需要恢复的人');
        return this.actionMenu();
      }
      this.pendingItem = list[j];
      return this.beginTargeting('item', targets);
    }
    if (choice === '待机') return this.finishAction(u);
    // 取消：退回移动前的位置
    this.battle.move(u, this.origin!.x, this.origin!.y);
    this.cursor = { ...this.origin! };
    this.reach = this.battle.reach(u);
    this.attackPreview = this.attackArea(u, this.reach);
    this.mode = 'move';
  }

  private beginTargeting(kind: TargetKind, targets: BattleUnit[]) {
    this.targetKind = kind;
    this.targets = [...targets].sort((a, b) => a.hp - b.hp);
    this.targetIdx = 0;
    const t = this.targets[0];
    this.cursor = { x: t.x, y: t.y };
    this.mode = 'target';
  }

  private updateTarget(input: Input) {
    const n = this.targets.length;
    const step = (d: number) => {
      this.targetIdx = (this.targetIdx + d + n) % n;
      const t = this.targets[this.targetIdx];
      this.cursor = { x: t.x, y: t.y };
      sfx.cursor();
    };
    if (input.pressed('left') || input.pressed('up')) step(-1);
    if (input.pressed('right') || input.pressed('down')) step(1);
    const tap = input.takeTap();
    if (tap) {
      const p = this.tapTile(tap);
      const j = p ? this.targets.findIndex((t) => t.x === p.x && t.y === p.y) : -1;
      if (j < 0) this.backToActions();
      else if (j === this.targetIdx) void this.confirmTarget();
      else step(j - this.targetIdx);
      return;
    }
    if (input.pressed('ok')) void this.confirmTarget();
    else if (input.pressed('cancel')) this.backToActions();
  }

  private backToActions() {
    sfx.cancel();
    this.mode = 'busy';
    const u = this.sel!;
    this.cursor = { x: u.x, y: u.y };
    void this.actionMenu();
  }

  private async confirmTarget() {
    const u = this.sel!;
    const t = this.targets[this.targetIdx];
    this.mode = 'busy';
    sfx.ok();
    if (this.targetKind === 'attack') {
      await this.playAttack(this.battle.attack(u, t));
    } else if (this.targetKind === 'heal') {
      const before = t.hp;
      const r = this.battle.heal(u, t);
      await this.playHeal(t, before, r.amount);
      await this.playExp([r.exp]);
    } else if (this.pendingItem) {
      const before = t.hp;
      const amount = this.battle.useItem(t, this.pendingItem);
      await this.playHeal(t, before, amount);
    }
    await this.finishAction(u);
  }

  private async battleMenu() {
    this.menuOpen = 'battle';
    const i = await this.ui.choose(['结束回合', '胜利条件', `音效：${settings.sound ? '开' : '关'}`, '放弃战斗'], { x: 8, y: 8, width: 92 });
    this.menuOpen = null;
    if (i === 0) {
      this.mode = 'busy';
      await this.enemyPhase();
    } else if (i === 1) {
      await this.showConditions();
    } else if (i === 2) {
      settings.sound = !settings.sound;
      saveSettings();
    } else if (i === 3) {
      const c = await this.ui.ask(null, '放弃这场战斗，回到标题画面吗？', ['放弃', '继续战斗']);
      if (c === 0) {
        this.mode = 'end';
        this.onEnd('lose');
      }
    }
  }

  // ───────── 动画 ─────────

  private tween(ms: number, fn: (p: number) => void): Promise<void> {
    return new Promise((done) => this.tweens.push({ t: 0, dur: Math.max(ms, 1) / 1000, fn, done }));
  }

  private stepTweens(dt: number) {
    const finished: Tween[] = [];
    for (const tw of this.tweens) {
      tw.t += dt;
      tw.fn(Math.min(1, tw.t / tw.dur));
      if (tw.t >= tw.dur) finished.push(tw);
    }
    if (finished.length) {
      this.tweens = this.tweens.filter((tw) => !finished.includes(tw));
      for (const tw of finished) tw.done();
    }
  }

  private async animateMove(u: BattleUnit, path: Pt[]) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      this.facing.set(u.uid, b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y < a.y ? 'up' : 'down');
      await this.tween(STEP_MS, (p) => this.pixelPos.set(u.uid, { x: (a.x + (b.x - a.x) * p) * TILE, y: (a.y + (b.y - a.y) * p) * TILE }));
    }
    this.pixelPos.delete(u.uid);
    this.facing.delete(u.uid);
  }

  private popup(u: BattleUnit, text: string, color: string, size = 11, dy = 0) {
    this.popups.push({ x: u.x * TILE + 8, y: u.y * TILE + dy, text, color, t: 0, size });
  }

  private async playAttack(res: AttackResult) {
    for (const uid of res.defeated) this.dying.add(uid);
    for (const s of res.strikes) {
      const a = this.battle.byUid(s.attacker);
      const d = this.battle.byUid(s.defender);
      if (s.counter) await wait(150);
      const dx = Math.sign(d.x - a.x);
      const dy = Math.sign(d.y - a.y);
      this.facing.set(a.uid, dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down');
      const before = s.hpAfter + s.dmg;
      this.hpShown.set(d.uid, before);
      await this.tween(110, (p) => this.pixelPos.set(a.uid, { x: (a.x + dx * 0.4 * p) * TILE, y: (a.y + dy * 0.4 * p) * TILE }));
      if (s.calc.magic) sfx.magic();
      if (s.hit) {
        if (s.crit) sfx.crit();
        else sfx.hit();
        this.flashUntil.set(d.uid, this.t + 0.2);
        this.popup(d, s.crit ? `会心 ${s.dmg}` : String(s.dmg), s.crit ? '#ffe060' : '#ffffff', s.crit ? 13 : 12);
        if (s.calc.mult > 1) this.popup(d, '克制!', '#ffa040', 9, -10);
        if (s.calc.resisted) this.popup(d, '抵抗', '#90c8ff', 9, -10);
      } else {
        sfx.miss();
        this.popup(d, 'MISS', '#b0b8c8');
      }
      await Promise.all([
        this.tween(110, (p) => this.pixelPos.set(a.uid, { x: (a.x + dx * 0.4 * (1 - p)) * TILE, y: (a.y + dy * 0.4 * (1 - p)) * TILE })),
        this.tween(320, (p) => this.hpShown.set(d.uid, before + (s.hpAfter - before) * p)),
      ]);
      this.pixelPos.delete(a.uid);
      this.facing.delete(a.uid);
      if (s.hpAfter === 0) {
        sfx.down();
        await this.tween(450, (p) => this.alpha.set(d.uid, 1 - p));
        this.dying.delete(d.uid);
        this.alpha.delete(d.uid);
        if (d.side === 'player') this.ui.toast(`${d.name} 撤退了`);
      }
      this.hpShown.delete(d.uid);
    }
    await this.playExp(res.exp);
  }

  private async playHeal(t: BattleUnit, before: number, amount: number) {
    sfx.heal();
    this.popup(t, `+${amount}`, '#70f090');
    await this.tween(400, (p) => this.hpShown.set(t.uid, before + amount * p));
    this.hpShown.delete(t.uid);
  }

  private async playExp(list: ExpEvent[]) {
    for (const e of list) {
      const u = this.battle.byUid(e.uid);
      if (!u.alive) continue;
      this.popup(u, `经验+${e.amount}`, '#80e8ff', 9, -12);
      for (const up of e.levelUps) {
        sfx.levelUp();
        const g = up.gains;
        await this.ui.say(null, `${u.name} 升到了 ${up.level} 级！\n体力+${g.hp}　攻击+${g.atk}　防御+${g.def}　命中+${g.hit}　闪避+${g.eva}`);
        if (up.promotedTo) await this.ui.say(null, `${u.name} 转职为「${CLASSES[up.promotedTo].name}」！`);
      }
    }
  }

  // ───────── 画面 ─────────

  private snapCamera() {
    const maxX = Math.max(0, this.battle.w * TILE - VW);
    const maxY = Math.max(0, this.battle.h * TILE - VH);
    this.cam.x = Math.max(0, Math.min(maxX, this.cursor.x * TILE + 8 - VW / 2));
    this.cam.y = Math.max(0, Math.min(maxY, this.cursor.y * TILE + 8 - VH / 2));
  }

  private followCamera(dt: number) {
    const tx = this.cam.x;
    const ty = this.cam.y;
    this.snapCamera();
    const k = Math.min(1, dt * 10);
    this.cam.x = tx + (this.cam.x - tx) * k;
    this.cam.y = ty + (this.cam.y - ty) * k;
  }

  private fillTile(ctx: CanvasRenderingContext2D, key: number, color: string) {
    const x = (key % this.battle.w) * TILE - Math.round(this.cam.x);
    const y = Math.floor(key / this.battle.w) * TILE - Math.round(this.cam.y);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const cx = Math.round(this.cam.x);
    const cy = Math.round(this.cam.y);
    ctx.drawImage(this.mapCanvas, -cx, -cy);
    const w = this.battle.w;
    if (this.mode === 'move' && this.reach) {
      for (const t of this.reach.tiles) this.fillTile(ctx, t.y * w + t.x, 'rgba(70,140,255,0.45)');
      if (this.attackPreview) for (const k of this.attackPreview) this.fillTile(ctx, k, 'rgba(255,80,60,0.3)');
    }
    if (this.danger) for (const k of this.danger.tiles) this.fillTile(ctx, k, 'rgba(255,70,50,0.32)');
    if (this.mode === 'target') {
      const color = this.targetKind === 'attack' ? 'rgba(255,60,60,0.5)' : 'rgba(80,230,120,0.5)';
      for (const t of this.targets) this.fillTile(ctx, t.y * w + t.x, color);
    }
    this.drawUnits(ctx, cx, cy);
    if (this.mode === 'idle' && !this.ui.busy()) this.drawReadyMarks(ctx, cx, cy);
    if (this.mode === 'idle' || this.mode === 'move' || this.mode === 'target' || this.mode === 'busy') this.drawCursorBox(ctx, cx, cy);
    for (const p of this.popups) {
      const rise = Math.min(1, p.t * 3) * 10;
      ctx.globalAlpha = p.t > 0.7 ? (1 - p.t) / 0.3 : 1;
      drawText(ctx, p.text, p.x - cx, p.y - cy - rise - 2, { size: p.size, bold: true, color: p.color, align: 'center', shadow: '#000' });
      ctx.globalAlpha = 1;
    }
    if (!this.banner && this.mode !== 'end' && this.mode !== 'target') this.drawHud(ctx);
    if (this.mode === 'target' && this.targetKind === 'attack' && this.sel) this.drawForecast(ctx);
    if (this.banner) this.drawBanner(ctx);
    this.ui.draw(ctx);
  }

  private drawUnits(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const list = this.battle.units.filter((u) => u.alive || this.dying.has(u.uid));
    const pos = (u: BattleUnit) => this.pixelPos.get(u.uid) ?? { x: u.x * TILE, y: u.y * TILE };
    list.sort((a, b) => pos(a).y - pos(b).y);
    for (const u of list) {
      const p = pos(u);
      const x = Math.round(p.x) - cx;
      const y = Math.round(p.y) - cy;
      ctx.globalAlpha = this.alpha.get(u.uid) ?? 1;
      ctx.fillStyle = u.side === 'player' ? 'rgba(40,110,255,0.75)' : 'rgba(230,50,40,0.75)';
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 14, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (u.boss) {
        ctx.strokeStyle = '#ffd040';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const look = lookOf(u.charId);
      const facing = this.facing.get(u.uid) ?? 'down';
      const moving = this.pixelPos.has(u.uid);
      const frame = moving ? Math.floor(this.t * 10) % 2 : !u.acted && u.side === 'player' ? Math.floor(this.t * 2) % 2 : 0;
      let img = u.acted && u.side === 'player' ? charSpriteGray(look, facing, frame) : charSprite(look, facing, frame);
      if ((this.flashUntil.get(u.uid) ?? 0) > this.t && Math.floor(this.t * 30) % 2 === 0) img = charSpriteFlash(look, facing, frame);
      ctx.drawImage(img, x, y - 2);
      const hp = this.hpShown.get(u.uid) ?? u.hp;
      drawBar(ctx, x + 2, y + 15, 12, 2, hp / u.maxHp);
      ctx.globalAlpha = 1;
    }
  }

  /** 还能行动的我方人物头上画一个跳动的黄箭头。 */
  private drawReadyMarks(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const bob = Math.round(Math.sin(this.t * 6) * 1.5);
    for (const u of this.battle.units) {
      if (u.side !== 'player' || !u.alive || u.acted) continue;
      const x = u.x * TILE - cx + 8;
      const y = u.y * TILE - cy - 6 + bob;
      ctx.fillStyle = '#1a1206';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 1);
      ctx.lineTo(x + 4, y - 1);
      ctx.lineTo(x, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd83a';
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 0.5);
      ctx.lineTo(x + 3, y - 0.5);
      ctx.lineTo(x, y + 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawCursorBox(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.cursor.x * TILE - cx;
    const y = this.cursor.y * TILE - cy;
    const o = Math.floor(this.t * 3) % 2;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(x, y);
    const a = -1 - o;
    const b = TILE + o;
    ctx.fillRect(a, a, 5, 1);
    ctx.fillRect(a, a, 1, 5);
    ctx.fillRect(b - 5, a, 5, 1);
    ctx.fillRect(b, a, 1, 5);
    ctx.fillRect(a, b, 5, 1);
    ctx.fillRect(a, b - 4, 1, 5);
    ctx.fillRect(b - 4, b, 5, 1);
    ctx.fillRect(b, b - 4, 1, 5);
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const top = this.cursor.y * TILE - this.cam.y > VH / 2;
    const left = this.cursor.x * TILE - this.cam.x > VW / 2;
    const x = left ? 4 : VW - 128;
    const y = top ? 4 : VH - 50;
    const u = this.battle.unitAt(this.cursor.x, this.cursor.y) ?? this.sel;
    const terr = this.battle.terrain(this.cursor.x, this.cursor.y);
    const kind = this.battle.tiles[this.cursor.y][this.cursor.x];
    if (u) {
      drawWindow(ctx, x, y, 124, 46);
      drawText(ctx, u.name, x + 8, y + 5, { color: u.side === 'player' ? '#9fd4ff' : '#ffaa9a' });
      drawText(ctx, `${CLASSES[u.cls].name} Lv${u.level}`, x + 116, y + 5, { align: 'right', size: 10 });
      drawBar(ctx, x + 8, y + 22, 58, 4, u.hp / u.maxHp);
      drawText(ctx, `${u.hp}/${u.maxHp}`, x + 116, y + 18, { align: 'right', size: 10 });
      drawText(ctx, `攻${u.atk} 防${u.def} 命${u.hit} 闪${u.eva}`, x + 8, y + 31, { size: 9, color: '#dde' });
    } else {
      drawWindow(ctx, x + 44, y + 14, 80, 32);
      drawText(ctx, terrainName(kind), x + 52, y + 18, { size: 10, color: '#ffe070' });
      drawText(ctx, terr ? `防+${Math.round(terr.def * 100)}% 闪+${terr.eva}` : '不能通过', x + 52, y + 31, { size: 9 });
    }
    const tag = `第${this.battle.turn}回合`;
    drawText(ctx, tag, VW / 2, top ? 4 : VH - 14, { size: 9, align: 'center', color: '#fff' });
  }

  private drawForecast(ctx: CanvasRenderingContext2D) {
    const a = this.sel!;
    const d = this.targets[this.targetIdx];
    const fc = this.battle.forecast(a, d);
    const w = 236;
    const h = 70;
    const x = (VW - w) / 2;
    const y = this.cursor.y * TILE - this.cam.y > VH / 2 ? 4 : VH - h - 4;
    drawWindow(ctx, x, y, w, h);
    const col = (u: BattleUnit, cx: number, dmg: string, hit: string, color: string) => {
      drawText(ctx, `${u.name} ${CLASSES[u.cls].name}`, cx, y + 5, { color, size: 11 });
      drawText(ctx, `体力 ${u.hp}/${u.maxHp}`, cx, y + 19, { size: 10 });
      drawText(ctx, `伤害 ${dmg}`, cx, y + 31, { size: 10 });
      drawText(ctx, `命中 ${hit}`, cx, y + 43, { size: 10 });
    };
    const mark = fc.strike.mult > 1 ? ' 克制' : fc.strike.resisted ? ' 抵抗' : '';
    col(a, x + 10, `${fc.strike.dmg}${mark}`, `${fc.strike.hit}%`, '#9fd4ff');
    if (fc.counter) {
      const cm = fc.counter.mult > 1 ? ' 克制' : fc.counter.resisted ? ' 抵抗' : '';
      col(d, x + w / 2 + 8, `${fc.counter.dmg}${cm}`, `${fc.counter.hit}%`, '#ffaa9a');
    } else {
      col(d, x + w / 2 + 8, '无法反击', '—', '#ffaa9a');
    }
    drawText(ctx, '▶', x + w / 2 - 6, y + 24, { color: '#ffe070' });
    drawText(ctx, '再点一次目标（或按 A）出手，点别处取消', x + w / 2, y + 57, { size: 8, align: 'center', color: '#b8c4ee' });
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    const b = this.banner!;
    const p = b.t / b.dur;
    const slide = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
    const h = 44 * slide;
    const y = VH / 2 - h / 2;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.2, 'rgba(8,10,30,0.85)');
    g.addColorStop(0.8, 'rgba(8,10,30,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, VW, h);
    if (slide < 0.6) return;
    const size = 34;
    const tw = brushWidth(b.text, size);
    drawBrush(ctx, b.text, (VW - tw) / 2, VH / 2 - size / 2 - 2, size, { fill: b.color, outline: '#0a0a14', outlineWidth: 3 });
  }
}
