// 原版事件脚本的解释器（原版在 $FD1A，指令表 $FD46）。
// 每条指令是一个字（0x00–0x4F），后面跟参数，FF FF 结束。
// 这里只负责读指令、取参数、控制流程；画面上的效果交给 host（地图场景）实现。
// 各指令的含义见 docs/rom-notes.md，还没弄清的指令只按原版的长度跳过参数。

import { ADDR, RomData } from '../rom/data';

export interface ObjDef {
  slot: number;
  sprite: number;
  anim: number;
  x: number;
  y: number;
  mode: number;
  talk: number;
}

export interface VmHost {
  /** op1d / op00：显示消息 */
  message(id: number): Promise<void>;
  /** op19：几个人物同时沿直线走到像素位置，走完后摆成 finals 里的姿势 */
  moveTo(first: number, targets: { x: number; y: number }[], finals: number[]): Promise<void>;
  /** op1a：几个人物走到格子（字的高字节 = 列，低字节 = 行；0xFF 表示走出画面） */
  moveCells(first: number, targets: number[], finals: number[]): Promise<void>;
  /** op1f：设人物姿势（朝向×4） */
  face(slot: number, anim: number): void;
  /** op20：主角朝某方向走一步 */
  step(dir: number): Promise<void>;
  /** op12 设地图和入口；op13 真正载入 */
  setMap(map: number, entry: number): void;
  loadMap(): Promise<void>;
  /** op25：进入战斗（地图、宽、高、镜头） */
  battle(map: number, w: number, h: number, camX: number, camY: number): Promise<void>;
  /** op23：放人物；op24：删人物；op2a：直接设位置 */
  placeObjects(defs: ObjDef[]): void;
  removeObject(slot: number): void;
  /** op27：清掉所有人物（战斗结束回到地图时） */
  clearObjects(): void;
  setObjectPos(slot: number, x: number, y: number): void;
  /** op21 / op22 */
  setFlag(group: number, bit: number, on: boolean): void;
  /** op26：加入队伍 */
  join(id: number): void;
  /** op2c：某个 NPC 的对话进度 +1 */
  advanceTalk(id: number): void;
  /** op32：接下来的战斗编号 */
  setBattle(id: number): void;
  /** op2d：世界地图上某个区域可去的地点 */
  setRegion(index: number, value: number): void;
  /** op15：等待若干帧 */
  wait(frames: number): Promise<void>;
  /** op10 / op11：淡出、淡入 */
  fadeOut(): Promise<void>;
  fadeIn(): Promise<void>;
  /** op1e：动画/移动节奏 */
  setMode(mode: number): void;
  /** op2e / op2f / op30：人物头上的表情（感叹号、问号等） */
  emote(kind: number, slots: number[]): Promise<void>;
  /** op16：调查的结果（道具号，0xFF01 表示什么也没有） */
  search(item: number): Promise<void>;
  /** op29：世界地图，返回选中的地点序号 */
  worldMap(): Promise<number>;
  /** op4b / op4d：音乐和音效 */
  sound(id: number): void;
  /** op14 / op17 / op37 / op46：开门之类的小动画 */
  doorAnim(kind: number): Promise<void>;
  /** 其它还没实现的指令，只记一下 */
  unknown(op: number, at: number): void;
}

const FIXED: Record<number, number> = {
  0x00: 2, 0x01: 2, 0x02: 0, 0x03: 0, 0x04: 0, 0x05: 66, 0x06: 0, 0x07: 2, 0x08: 0, 0x09: 0, 0x0a: 0, 0x0b: 0,
  0x0c: 0, 0x0f: 0, 0x10: 0, 0x11: 0, 0x12: 4, 0x13: 0, 0x14: 0, 0x15: 2, 0x16: 2, 0x17: 0, 0x18: 2, 0x1b: 2,
  0x1c: 4, 0x1d: 2, 0x1e: 2, 0x1f: 2, 0x20: 2, 0x21: 2, 0x22: 2, 0x24: 2, 0x25: 6, 0x26: 2, 0x27: 0, 0x28: 2,
  0x29: 0, 0x2a: 6, 0x2b: 2, 0x2c: 2, 0x2d: 2, 0x31: 2, 0x32: 2, 0x33: 6, 0x34: 0, 0x36: 2, 0x37: 0, 0x38: 0,
  0x39: 0, 0x3a: 2, 0x3b: 2, 0x3c: 2, 0x3d: 2, 0x3e: 4, 0x3f: 2, 0x40: 4, 0x41: 0, 0x42: 2, 0x44: 0, 0x45: 0,
  0x46: 0, 0x47: 0, 0x48: 0, 0x49: 0, 0x4a: 0, 0x4b: 2, 0x4c: 0, 0x4d: 2, 0x4e: 0, 0x4f: 0,
};

/** 某条指令（含指令号）占多少字节；0x0d 这种运行时才知道长度的返回 2。 */
export function opLength(rom: RomData, at: number): number {
  const op = rom.u16(at);
  const a = at + 2;
  if (op in FIXED) return 2 + FIXED[op];
  switch (op) {
    case 0x19: {
      const n = rom.u8(a + 1);
      return 2 + 2 + 4 * n + n + (n & 1);
    }
    case 0x1a: {
      const n = rom.u8(a + 1);
      return 2 + 2 + 2 * n + n + (n & 1);
    }
    case 0x23: {
      let p = a;
      while (rom.u16(p) <= 0x0f) p += 10;
      return p - at + 2;
    }
    case 0x2e:
    case 0x2f:
    case 0x30:
    case 0x35:
      return 2 + 2 + 2 * rom.u16(a);
    case 0x0e:
      return 6;
    case 0x0d:
      return 2;
    default:
      return 2;
  }
}

/** 某组某个事件号的脚本地址（原版 $1201A）。 */
export function eventAddr(rom: RomData, group: number, code: number) {
  const block = rom.u32(ADDR.events + group * 4);
  return block + rom.u16(block + code * 2);
}

export class Vm {
  /** 原版 $FF6158：选单、分支用的序号 */
  choice = 0;
  running = false;

  constructor(
    private readonly rom: RomData,
    private readonly host: VmHost,
  ) {}

  async run(start: number) {
    const rom = this.rom;
    const h = this.host;
    let pc = start;
    this.running = true;
    try {
      for (let steps = 0; steps < 5000; steps++) {
        const op = rom.u16(pc);
        if (op === 0xffff) return;
        const a = pc + 2;
        let next = pc + opLength(rom, pc);
        switch (op) {
          case 0x00:
          case 0x1d:
            await h.message(rom.u16(a));
            break;
          case 0x0d: {
            // 按 choice 取标签字，往后找同样的字
            const label = rom.u16(a + this.choice * 2);
            let p = a + this.choice * 2 + 2;
            while (rom.u16(p) !== label) p += 2;
            next = p + 2;
            break;
          }
          case 0x0e: {
            const label = rom.u16(a);
            if (rom.u16(a + 2) === 0) {
              let p = a + 4;
              while (rom.u16(p) !== label) p += 2;
              next = p + 2;
            } else {
              // 原版从指令前一个字开始往前找
              let p = pc - 2;
              while (rom.u16(p) !== label) p -= 2;
              next = p + 2;
            }
            break;
          }
          case 0x10:
            await h.fadeOut();
            break;
          case 0x11:
            await h.fadeIn();
            break;
          case 0x12:
            h.setMap(rom.u16(a), rom.u16(a + 2));
            break;
          case 0x13:
            await h.loadMap();
            break;
          case 0x14:
          case 0x17:
          case 0x37:
          case 0x46:
            await h.doorAnim(op);
            break;
          case 0x15:
            await h.wait(rom.u16(a));
            break;
          case 0x16:
            await h.search(rom.u16(a));
            break;
          case 0x19: {
            const first = rom.u8(a);
            const n = rom.u8(a + 1);
            const targets = [];
            for (let i = 0; i < n; i++) targets.push({ x: rom.u16(a + 2 + i * 4), y: rom.u16(a + 4 + i * 4) });
            const finals = [];
            for (let i = 0; i < n; i++) finals.push(rom.u8(a + 2 + n * 4 + i));
            await h.moveTo(first, targets, finals);
            break;
          }
          case 0x1a: {
            const first = rom.u8(a);
            const n = rom.u8(a + 1);
            const targets = [];
            for (let i = 0; i < n; i++) targets.push(rom.u16(a + 2 + i * 2));
            const finals = [];
            for (let i = 0; i < n; i++) finals.push(rom.u8(a + 2 + n * 2 + i));
            await h.moveCells(first, targets, finals);
            break;
          }
          case 0x1e:
            h.setMode(rom.u16(a));
            break;
          case 0x1f:
            h.face(rom.u8(a), rom.u8(a + 1));
            break;
          case 0x20:
            await h.step(rom.u16(a));
            break;
          case 0x21:
          case 0x22:
            h.setFlag(rom.u8(a), rom.u8(a + 1), op === 0x21);
            break;
          case 0x23: {
            const defs: ObjDef[] = [];
            let p = a;
            while (rom.u16(p) <= 0x0f) {
              defs.push({
                slot: rom.u16(p),
                sprite: rom.u8(p + 2),
                anim: rom.u8(p + 3),
                x: rom.u16(p + 4),
                y: rom.u16(p + 6),
                mode: rom.u8(p + 8),
                talk: rom.u8(p + 9),
              });
              p += 10;
            }
            h.placeObjects(defs);
            break;
          }
          case 0x24:
            h.removeObject(rom.u16(a));
            break;
          case 0x25:
            await h.battle(rom.u16(a), rom.u8(a + 2), rom.u8(a + 3), rom.u8(a + 4), rom.u8(a + 5));
            break;
          case 0x26:
            h.join(rom.u16(a));
            break;
          case 0x27:
            h.clearObjects();
            break;
          case 0x29:
            this.choice = await h.worldMap();
            break;
          case 0x2a:
            h.setObjectPos(rom.u16(a), rom.u16(a + 2), rom.u16(a + 4));
            break;
          case 0x2c:
            h.advanceTalk(rom.u16(a));
            break;
          case 0x2d:
            h.setRegion(rom.u8(a), rom.u8(a + 1));
            break;
          case 0x32:
            h.setBattle(rom.u16(a));
            break;
          case 0x2e:
          case 0x2f:
          case 0x30: {
            const n = rom.u16(a);
            const slots = [];
            for (let i = 0; i < n; i++) slots.push(rom.u16(a + 2 + i * 2));
            await h.emote(op, slots);
            break;
          }
          case 0x4b:
          case 0x4d:
            h.sound(rom.u16(a));
            break;
          case 0x28:
          case 0x4c:
          case 0x4e:
          case 0x4f:
            break; // 画面亮度、内部标记之类，复刻版不需要
          default:
            h.unknown(op, pc);
        }
        pc = next;
      }
    } finally {
      this.running = false;
    }
  }
}
