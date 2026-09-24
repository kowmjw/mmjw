// 原版 $1C5AC：按剧情旗标改地图属性层（打开/关闭事件格）。每组一段写死的 68000 代码，
// 只用到 8 种指令，这里直接解释执行，结果和原版一模一样，也不用把数据抄进仓库。

import { RomData } from './data';

const TABLE = 0x1c5f2;
const RAM_MAP = 0xffe100;
const RAM_ATTR = 0xffd000;

/**
 * 执行第 group 组的旗标补丁：flags 是这一组的 32 位旗标，map 是当前地图编号，
 * attr 是当前地图的属性层（会被就地修改）。
 */
export function applyFlagPatches(rom: RomData, group: number, flags: number, map: number, attr: Uint8Array) {
  let pc = rom.u32(TABLE + group * 4);
  let d1 = 0;
  let z = false; // 零标志
  const write8 = (addr: number, v: number) => {
    const i = addr - RAM_ATTR;
    if (i >= 0 && i < attr.length) attr[i] = v & 0xff;
  };
  for (let steps = 0; steps < 2000; steps++) {
    const op = rom.u16(pc);
    if (op === 0x4e75) return; // rts
    if (op === 0x4e71) {
      pc += 2; // nop
      continue;
    }
    if (op === 0x2212) {
      d1 = flags >>> 0; // move.l (a2),d1
      pc += 2;
      continue;
    }
    if (op === 0x0801) {
      // btst #n,d1（数据寄存器按 32 位算）
      const bit = rom.u16(pc + 2) & 31;
      z = ((d1 >>> bit) & 1) === 0;
      pc += 4;
      continue;
    }
    if (op === 0x0c79) {
      // cmpi.w #imm,abs.l —— 只会拿来比较当前地图编号
      const imm = rom.u16(pc + 2);
      const addr = rom.u32(pc + 4);
      z = addr === RAM_MAP ? map === imm : false;
      pc += 8;
      continue;
    }
    if (op === 0x13fc) {
      // move.b #imm,abs.l
      write8(rom.u32(pc + 4), rom.u16(pc + 2));
      pc += 8;
      continue;
    }
    if (op === 0x33fc) {
      // move.w #imm,abs.l
      const v = rom.u16(pc + 2);
      const addr = rom.u32(pc + 4);
      write8(addr, v >> 8);
      write8(addr + 1, v);
      pc += 8;
      continue;
    }
    if (op === 0x6700 || op === 0x6600) {
      // beq.w / bne.w
      const disp = rom.s16(pc + 2);
      const take = op === 0x6700 ? z : !z;
      pc = take ? pc + 2 + disp : pc + 4;
      continue;
    }
    if ((op & 0xff00) === 0x6700 || (op & 0xff00) === 0x6600 || (op & 0xff00) === 0x6000) {
      // 短跳转
      const d8 = op & 0xff;
      const disp = d8 & 0x80 ? d8 - 256 : d8;
      const kind = op & 0xff00;
      const take = kind === 0x6000 || (kind === 0x6700 ? z : !z);
      pc = take ? pc + 2 + disp : pc + 2;
      continue;
    }
    if (op === 0x6000) {
      pc = pc + 2 + rom.s16(pc + 2);
      continue;
    }
    console.warn(`旗标补丁里有不认识的指令 ${op.toString(16)} @ ${pc.toString(16)}`);
    return;
  }
}
