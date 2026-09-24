import { charSprite, type Facing } from '../art/characters';
import { TILE, renderMap } from '../art/tiles';
import { BattleScene } from '../battle/BattleScene';
import { BATTLES } from '../data/battles';
import { CHARS, lookOf } from '../data/characters';
import { CLASSES, nextPromotion, type RangeShape } from '../data/classes';
import { ITEMS, addItem, countItem, takeItem, type ItemId } from '../data/items';
import { MAPS, type FieldMapDef, type NpcDef, type ObjDef, type WarpDef } from '../data/maps';
import { parseRows, walkable, type TileKind } from '../data/terrain';
import { wait, type Game, type Scene } from '../engine/game';
import type { Tap } from '../engine/input';
import { findPath, type Pt } from '../engine/path';
import { VH, VW } from '../engine/screen';
import { sfx } from '../engine/sfx';
import { AUTO_SLOT, claudeRuntime, exportSaves, importSaves, saveSettings, settings } from '../engine/storage';
import { drawText } from '../engine/text';
import { UiLayer, drawWindow } from '../engine/ui';
import { saveGame, slotItems } from '../game/saves';
import { flag, inParty, makeMember, setFlag, type GameState, type Member } from '../game/state';
import type { BattleHooks, StoryApi, StoryEvent } from '../story/api';
import { EVENTS } from '../story/chapter1';
import { SPEAKERS } from '../story/speakers';

const DIR_VEC: Record<Facing, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Facing, Facing> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const WALK_SPEED = 6.5;

function dirTo(a: Pt, b: Pt): Facing {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  return b.y < a.y ? 'up' : 'down';
}

function rangeText(r: RangeShape, magic?: boolean) {
  const shape = r.kind === 'square' ? '周围八格' : r.kind === 'cross' ? (r.max === 1 ? '前后左右' : `直线 ${r.min === r.max ? r.max : `${r.min}~${r.max}`} 格`) : `${r.min}~${r.max} 格内`;
  return `${shape}${magic ? '（法术）' : ''}`;
}

interface Npc extends NpcDef {
  dir: Facing;
}

export interface FieldNav {
  toTitle: () => Promise<void>;
}

export class FieldScene implements Scene {
  private map!: FieldMapDef;
  private tiles!: TileKind[][];
  private mapCanvas!: HTMLCanvasElement;
  private npcs: Npc[] = [];
  private readonly player = { x: 0, y: 0, dir: 'down' as Facing, fromX: 0, fromY: 0, t: 1, walking: false, anim: 0 };
  private route: Pt[] = [];
  private routeGoal: Pt | null = null;
  private readonly ui: UiLayer;
  private busy = 0;
  private started = false;
  private readonly api: StoryApi;

  constructor(
    private readonly game: Game,
    private readonly state: GameState,
    private readonly nav: FieldNav,
  ) {
    this.ui = new UiLayer(game.screen.ctx);
    const portrait = (who: string) => {
      const s = SPEAKERS[who];
      return s ? charSprite(lookOf(s.look)) : null;
    };
    this.api = {
      state,
      say: (who, text) => this.ui.say(SPEAKERS[who]?.name ?? who, text, portrait(who)),
      msg: (text) => this.ui.say(null, text),
      ask: (who, text, options) => this.ui.ask(who ? (SPEAKERS[who]?.name ?? who) : null, text, options, who ? portrait(who) : null, false),
      narrate: (lines, title, subtitle) => this.ui.narrate(lines, title ?? null, subtitle ?? null),
      give: (item, n) => this.give(item, n),
      join: (id) => this.join(id),
      flag: (k) => flag(state, k),
      set: (k, v) => {
        setFlag(state, k, v);
        this.refreshNpcs();
      },
      battle: (id, hooks) => this.startBattle(id, hooks ?? {}),
      save: () => this.save(AUTO_SLOT),
      stepBack: () => this.stepBack(),
      wait,
      toTitle: () => this.nav.toTitle(),
    };
  }

  enter() {
    if (this.started) return;
    this.started = true;
    this.load(this.state.map, this.state.x, this.state.y, this.state.dir);
    this.onMapEnter();
  }

  private load(id: string, x: number, y: number, dir: Facing) {
    this.map = MAPS[id];
    this.tiles = parseRows(this.map.rows);
    this.mapCanvas = renderMap(this.tiles);
    Object.assign(this.player, { x, y, dir, fromX: x, fromY: y, t: 1, walking: false });
    this.route = [];
    this.routeGoal = null;
    this.refreshNpcs();
    this.syncState();
  }

  private refreshNpcs() {
    const old = new Map(this.npcs.map((n) => [n.id, n.dir]));
    this.npcs = this.map.npcs.filter((n) => !n.hideIf || !flag(this.state, n.hideIf)).map((n) => ({ ...n, dir: old.get(n.id) ?? n.dir ?? 'down' }));
  }

  private syncState() {
    this.state.map = this.map.id;
    this.state.x = this.player.x;
    this.state.y = this.player.y;
    this.state.dir = this.player.dir;
  }

  private onMapEnter() {
    this.ui.toast(this.map.name);
    if (this.map.onEnter) this.run(EVENTS[this.map.onEnter]);
  }

  private run(ev: StoryEvent | undefined) {
    if (!ev) return;
    this.busy++;
    void ev(this.api)
      .catch((e) => console.error(e))
      .finally(() => this.busy--);
  }

  // ───────── 更新 ─────────

  update(dt: number) {
    this.state.time += dt;
    const input = this.game.input;
    const uiBusy = this.ui.update(dt, input);
    this.stepWalk(dt);
    if (uiBusy || this.busy > 0 || this.player.walking) return;
    if (this.route.length || this.routeGoal) {
      if (input.takeTap() || input.pressed('cancel')) {
        this.route = [];
        this.routeGoal = null;
      } else {
        this.followRoute();
        return;
      }
    }
    const tap = input.takeTap();
    if (tap) return this.onTap(tap);
    if (input.pressed('ok')) return this.interact();
    if (input.pressed('cancel') || input.pressed('menu')) {
      void this.openMenu();
      return;
    }
    for (const d of ['up', 'down', 'left', 'right'] as Facing[]) {
      if (input.isHeld(d) || input.pressed(d)) {
        this.tryStep(d);
        break;
      }
    }
  }

  private inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && y < this.tiles.length && x < this.tiles[0].length;
  }

  private npcAt(x: number, y: number) {
    return this.npcs.find((n) => n.x === x && n.y === y) ?? null;
  }

  private objAt(x: number, y: number) {
    return this.map.objects.find((o) => o.x === x && o.y === y) ?? null;
  }

  private passable(x: number, y: number) {
    return this.inBounds(x, y) && walkable(this.tiles[y][x]) && !this.npcAt(x, y);
  }

  private tryStep(dir: Facing) {
    const p = this.player;
    p.dir = dir;
    const nx = p.x + DIR_VEC[dir].x;
    const ny = p.y + DIR_VEC[dir].y;
    if (!this.passable(nx, ny)) return false;
    p.fromX = p.x;
    p.fromY = p.y;
    p.x = nx;
    p.y = ny;
    p.t = 0;
    p.walking = true;
    return true;
  }

  private stepWalk(dt: number) {
    const p = this.player;
    if (!p.walking) return;
    p.t += dt * WALK_SPEED;
    p.anim += dt;
    if (p.t >= 1) {
      p.t = 1;
      p.walking = false;
      this.arrive();
    }
  }

  private arrive() {
    const p = this.player;
    this.syncState();
    const warp = this.map.warps.find((w) => w.x === p.x && w.y === p.y);
    if (warp) {
      this.route = [];
      this.routeGoal = null;
      void this.warp(warp);
      return;
    }
    const trig = this.map.triggers.find((t) => p.x >= t.x && p.x < t.x + (t.w ?? 1) && p.y >= t.y && p.y < t.y + (t.h ?? 1));
    if (trig) {
      this.route = [];
      this.routeGoal = null;
      this.run(EVENTS[trig.event]);
    }
  }

  private async warp(w: WarpDef) {
    this.busy++;
    sfx.step();
    await this.game.fadeTo(1, 180);
    this.load(w.to, w.tx, w.ty, w.dir);
    await this.game.fadeTo(0, 180);
    this.busy--;
    this.onMapEnter();
  }

  private stepBack() {
    const p = this.player;
    const back = OPPOSITE[p.dir];
    const nx = p.x + DIR_VEC[back].x;
    const ny = p.y + DIR_VEC[back].y;
    if (this.passable(nx, ny)) Object.assign(p, { x: nx, y: ny, fromX: nx, fromY: ny, t: 1 });
    p.dir = back;
    this.syncState();
  }

  private interact() {
    const p = this.player;
    const tx = p.x + DIR_VEC[p.dir].x;
    const ty = p.y + DIR_VEC[p.dir].y;
    const npc = this.npcAt(tx, ty);
    if (npc) {
      npc.dir = OPPOSITE[p.dir];
      this.run(EVENTS[npc.talk]);
      return;
    }
    const obj = this.objAt(tx, ty);
    if (obj) this.run(() => this.search(obj));
  }

  private async search(obj: ObjDef) {
    if (obj.item) {
      if (obj.flag && flag(this.state, obj.flag)) {
        await this.ui.say(null, '里面已经空了。');
        return;
      }
      if (obj.flag) setFlag(this.state, obj.flag);
      await this.give(obj.item, obj.count ?? 1);
      return;
    }
    await this.ui.say(null, obj.text ?? '什么也没有。');
  }

  private onTap(tap: Tap) {
    if (tap.x > VW - 36 && tap.y > VH - 20) {
      void this.openMenu();
      return;
    }
    const cam = this.camera();
    const tx = Math.floor((tap.x + cam.x) / TILE);
    const ty = Math.floor((tap.y + cam.y) / TILE);
    const p = this.player;
    if (!this.inBounds(tx, ty) || (tx === p.x && ty === p.y)) return;
    const target = { x: tx, y: ty };
    const w = this.tiles[0].length;
    const h = this.tiles.length;
    const pass = (x: number, y: number) => this.passable(x, y);
    if (this.npcAt(tx, ty) || this.objAt(tx, ty)) {
      if (Math.abs(tx - p.x) + Math.abs(ty - p.y) === 1) {
        p.dir = dirTo(p, target);
        this.interact();
        return;
      }
      // 走到它旁边再对话
      let best: Pt[] | null = null;
      for (const d of Object.values(DIR_VEC)) {
        const n = { x: tx + d.x, y: ty + d.y };
        if (!this.passable(n.x, n.y)) continue;
        const path = findPath(w, h, p, n, pass);
        if (path && (!best || path.length < best.length)) best = path;
      }
      if (best) {
        this.route = best.slice(1);
        this.routeGoal = target;
      }
      return;
    }
    const path = findPath(w, h, p, target, pass);
    if (path && walkable(this.tiles[ty][tx])) this.route = path.slice(1);
  }

  private followRoute() {
    const next = this.route.shift();
    if (next) {
      if (!this.tryStep(dirTo(this.player, next))) this.route = [];
      return;
    }
    const goal = this.routeGoal;
    this.routeGoal = null;
    if (goal) {
      this.player.dir = dirTo(this.player, goal);
      this.interact();
    }
  }

  // ───────── 剧情接口 ─────────

  private async give(item: ItemId, n = 1) {
    addItem(this.state.inv, item, n);
    sfx.item();
    await this.ui.say(null, `获得了「${ITEMS[item].name}」${n > 1 ? `×${n}` : ''}！`);
  }

  private async join(id: string) {
    if (!inParty(this.state, id)) this.state.party.push(makeMember(id));
    sfx.levelUp();
    await this.ui.say(null, `${CHARS[id].name} 加入了队伍！`);
  }

  private startBattle(id: string, hooks: BattleHooks): Promise<void> {
    this.syncState();
    return new Promise((resolve) => {
      const scene = new BattleScene(this.game, BATTLES[id], this.state, hooks, (result) => {
        if (result === 'win') void this.game.switchTo(this).then(resolve);
        else void this.nav.toTitle();
      });
      void this.game.switchTo(scene);
    });
  }

  private save(slot: number) {
    this.syncState();
    return saveGame(slot, this.state, this.map.name);
  }

  // ───────── 菜单 ─────────

  private async openMenu() {
    sfx.ok();
    this.busy++;
    try {
      let start = 0;
      for (;;) {
        const i = await this.ui.choose(['队伍', '道具', '存档', '设置', '回到标题'], { x: VW - 92, y: 8, width: 84, start });
        if (i < 0) return;
        start = i;
        if (i === 0) await this.partyMenu();
        else if (i === 1) await this.itemMenu();
        else if (i === 2) await this.saveMenu();
        else if (i === 3) await this.settingsMenu();
        else if ((await this.ui.ask(null, '要回到标题画面吗？没有存档的进度会丢失。', ['回到标题', '取消'])) === 0) {
          await this.nav.toTitle();
          return;
        }
      }
    } finally {
      this.busy--;
    }
  }

  private async partyMenu() {
    let start = 0;
    for (;;) {
      const items = this.state.party.map((m) => ({ label: CHARS[m.id].name, right: `Lv${m.level} ${CLASSES[m.cls].name}` }));
      const i = await this.ui.choose(items, { title: '队伍', width: 150, start });
      if (i < 0) return;
      start = i;
      const m = this.state.party[i];
      await this.ui.panel((ctx) => this.drawStatus(ctx, m));
    }
  }

  private drawStatus(ctx: CanvasRenderingContext2D, m: Member) {
    const c = CHARS[m.id];
    const cls = CLASSES[m.cls];
    const acc = m.accessory ? ITEMS[m.accessory] : null;
    const bonus = acc?.bonus ?? {};
    const x = 20;
    const y = 16;
    const w = VW - 40;
    const h = VH - 32;
    drawWindow(ctx, x, y, w, h, 0.96);
    ctx.fillStyle = '#1a2250';
    ctx.fillRect(x + 12, y + 12, 36, 36);
    ctx.drawImage(charSprite(c.look), 0, 0, 16, 16, x + 14, y + 14, 32, 32);
    drawText(ctx, c.name, x + 58, y + 12, { size: 14, bold: true, color: '#ffe070' });
    if (c.title) drawText(ctx, c.title, x + 58 + c.name.length * 15 + 8, y + 14, { size: 11, color: '#c8d0ff' });
    drawText(ctx, `${cls.name}　Lv ${m.level}　经验 ${m.exp}/100`, x + 58, y + 32);
    const stat = (label: string, v: number, extra: number | undefined, sx: number, sy: number) => {
      drawText(ctx, label, sx, sy, { color: '#9fb4ff' });
      drawText(ctx, String(v + (extra ?? 0)), sx + 34, sy, { color: extra ? '#80ff90' : '#fff' });
    };
    const row1 = y + 58;
    stat('体力', m.hp, bonus.hp, x + 14, row1);
    stat('攻击', m.atk, bonus.atk, x + 98, row1);
    stat('防御', m.def, bonus.def, x + 182, row1);
    stat('命中', m.hit, bonus.hit, x + 14, row1 + 18);
    stat('闪避', m.eva, bonus.eva, x + 98, row1 + 18);
    drawText(ctx, '移动', x + 182, row1 + 18, { color: '#9fb4ff' });
    drawText(ctx, String(cls.mov), x + 216, row1 + 18);
    drawText(ctx, `攻击范围：${rangeText(cls.range, cls.magic)}`, x + 14, row1 + 40);
    drawText(ctx, `饰品：${acc ? `${acc.name}（${acc.desc.replace('饰品。', '').replace(/。$/, '')}）` : '无'}`, x + 14, row1 + 58);
    const promo = nextPromotion(m.cls);
    drawText(ctx, promo ? `转职：${promo.level} 级转为「${promo.name}」` : '转职：已是最高阶', x + 14, row1 + 76);
    drawText(ctx, cls.desc, x + 14, row1 + 94, { size: 10, color: '#c8d0e8' });
  }

  private async itemMenu() {
    let start = 0;
    for (;;) {
      const ids = (Object.keys(this.state.inv) as ItemId[]).filter((id) => countItem(this.state.inv, id) > 0);
      const equipped = this.state.party.filter((m) => m.accessory);
      if (!ids.length && !equipped.length) {
        await this.ui.say(null, '没有道具。');
        return;
      }
      const items = [
        ...ids.map((id) => ({ label: ITEMS[id].name, right: `×${countItem(this.state.inv, id)}` })),
        ...equipped.map((m) => ({ label: ITEMS[m.accessory!].name, right: `${CHARS[m.id].name}装备中` })),
      ];
      const i = await this.ui.choose(items, { title: '道具', width: 180, start });
      if (i < 0) return;
      start = i;
      const id = i < ids.length ? ids[i] : equipped[i - ids.length].accessory!;
      const item = ITEMS[id];
      if (item.kind === 'equip') {
        await this.equipMenu(id);
      } else if (item.kind === 'use') {
        await this.ui.say(null, `${item.name}：${item.desc}\n（战斗中选「道具」使用）`);
      } else {
        await this.ui.say(null, `${item.name}：${item.desc}`);
      }
    }
  }

  private async equipMenu(id: ItemId) {
    const item = ITEMS[id];
    const items = this.state.party.map((m) => ({
      label: CHARS[m.id].name,
      right: m.accessory === id ? '卸下' : m.accessory ? `换下${ITEMS[m.accessory].name}` : '',
    }));
    const i = await this.ui.choose(items, { title: `${item.name}：给谁装备？`, width: 200 });
    if (i < 0) return;
    const m = this.state.party[i];
    const name = CHARS[m.id].name;
    if (m.accessory === id) {
      m.accessory = null;
      addItem(this.state.inv, id);
      this.ui.toast(`${name} 卸下了${item.name}`);
      return;
    }
    if (!takeItem(this.state.inv, id)) {
      // 装在别人身上：先卸下来
      const holder = this.state.party.find((p) => p.accessory === id);
      if (!holder) return;
      holder.accessory = null;
    }
    if (m.accessory) addItem(this.state.inv, m.accessory);
    m.accessory = id;
    sfx.item();
    this.ui.toast(`${name} 装备了${item.name}`);
  }

  private async saveMenu() {
    const i = await this.ui.choose(slotItems(1, false), { title: '存到哪里？', width: 240 });
    if (i < 0) return;
    const slot = i + 1;
    if (this.save(slot)) {
      sfx.item();
      this.ui.toast('存档完成');
    } else {
      await this.ui.say(null, '存档写入浏览器失败了（可能是无痕模式）。这次打开期间还能读取，关掉页面就没了。可以在「设置」里导出存档备份。');
    }
  }

  private async settingsMenu() {
    let start = 0;
    for (;;) {
      const speed = settings.textSpeed >= 80 ? '快' : settings.textSpeed >= 40 ? '中' : '慢';
      const i = await this.ui.choose([`音效：${settings.sound ? '开' : '关'}`, `文字速度：${speed}`, '导出存档', '导入存档'], { title: '设置', width: 140, start });
      if (i < 0) return;
      start = i;
      if (i === 0) settings.sound = !settings.sound;
      if (i === 1) settings.textSpeed = settings.textSpeed >= 80 ? 20 : settings.textSpeed >= 40 ? 80 : 40;
      saveSettings();
      if (i === 2) await this.exportFile();
      if (i === 3) await this.importFile();
    }
  }

  private async exportFile() {
    const data = exportSaves();
    const filename = 'shuihu-saves.json';
    // 在 claude.ai 里用平台的下载确认框；普通网页直接下载
    const runtime = claudeRuntime();
    const downloads = runtime ? ((await runtime.use('downloads')) as { save(r: { filename: string; data: string }): Promise<unknown> } | null) : null;
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        this.ui.toast('已导出存档文件');
      } catch (e) {
        this.ui.toast((e as { code?: string }).code === 'declined' ? '已取消导出' : '这里没法导出文件');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.ui.toast('已导出存档文件');
  }

  private importFile(): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          try {
            const n = importSaves(await file.text());
            this.ui.toast(`导入了 ${n} 个存档`);
          } catch (e) {
            this.ui.toast(e instanceof Error ? e.message : '导入失败');
          }
        }
        resolve();
      };
      input.click();
      // 用户取消选择时 change 不会触发，稍后自动继续
      setTimeout(resolve, 1500);
    });
  }

  // ───────── 画面 ─────────

  private playerPixel(): Pt {
    const p = this.player;
    return { x: (p.fromX + (p.x - p.fromX) * p.t) * TILE, y: (p.fromY + (p.y - p.fromY) * p.t) * TILE };
  }

  private camera(): Pt {
    const pp = this.playerPixel();
    const mw = this.tiles[0].length * TILE;
    const mh = this.tiles.length * TILE;
    const cx = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, pp.x + 8 - VW / 2));
    const cy = mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, pp.y + 8 - VH / 2));
    return { x: Math.round(cx), y: Math.round(cy) };
  }

  draw(ctx: CanvasRenderingContext2D) {
    const cam = this.camera();
    ctx.drawImage(this.mapCanvas, -cam.x, -cam.y);
    const pp = this.playerPixel();
    const leader = this.state.party[0];
    const p = this.player;
    const frame = p.walking ? (Math.floor(p.t * 2) % 2 === 0 ? 1 : 0) : 0;
    const actors = [
      ...this.npcs.map((n) => ({ y: n.y * TILE, x: n.x * TILE, img: charSprite(lookOf(n.look), n.dir, 0) })),
      { y: pp.y, x: pp.x, img: charSprite(lookOf(leader.id), p.dir, frame) },
    ].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      const x = Math.round(a.x) - cam.x;
      const y = Math.round(a.y) - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(a.img, x, y - 3);
    }
    if (!this.ui.busy() && this.busy === 0) drawText(ctx, '菜单', VW - 6, VH - 14, { size: 9, align: 'right', color: 'rgba(255,255,255,0.55)' });
    this.ui.draw(ctx);
  }
}
