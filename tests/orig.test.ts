// 原版数据解码和脚本机的测试。用合成数据，不需要真 ROM（ROM 不进仓库）。
import { describe, expect, it } from 'vitest';
import { battleEventCodes } from '../src/rom/battle';
import { ADDR, isKnownRom, RomData } from '../src/rom/data';
import { unRle } from '../src/rom/maps';
import { applyFlagPatches } from '../src/rom/patches';
import { crc32, romFromText, romToText, loadRomBytes } from '../src/rom/romfile';
import { decodeMessageAt } from '../src/rom/text';
import { opLength, Vm, type VmHost } from '../src/orig/vm';

/** 一块 2MB 的假 ROM，按需往里写字节。 */
function fakeRom() {
  const b = new Uint8Array(0x200000);
  const w8 = (a: number, ...v: number[]) => v.forEach((x, i) => (b[a + i] = x));
  const w16 = (a: number, ...v: number[]) => v.forEach((x, i) => w8(a + i * 2, x >> 8, x & 255));
  const w32 = (a: number, v: number) => w16(a, v >>> 16, v & 0xffff);
  return { b, w8, w16, w32, rom: new RomData(b) };
}

describe('地图 RLE', () => {
  it('单字节、双字节模式和结束标记', () => {
    // 01 02 | F3 07 → 07×3 | F1 F2 0A 0B → (0A 0B)×2 | F0 FF 05 09 → 09×5 | FF 00
    const data = Uint8Array.from([0x01, 0x02, 0xf3, 0x07, 0xf1, 0xf2, 0x0a, 0x0b, 0xf0, 0xff, 0x05, 0x09, 0xff, 0x00, 0x77]);
    const { data: out, next } = unRle(data, 0);
    expect([...out]).toEqual([1, 2, 7, 7, 7, 10, 11, 10, 11, 9, 9, 9, 9, 9]);
    expect(next).toBe(14);
  });

  it('三段连在一起时依次解出', () => {
    const data = Uint8Array.from([0xff, 0x00, 0x05, 0xff, 0x00, 0x70, 0x70, 0xff, 0x00]);
    const a = unRle(data, 0);
    const b = unRle(data, a.next);
    const c = unRle(data, b.next);
    expect([a.data.length, [...b.data], [...c.data]]).toEqual([0, [5], [0x70, 0x70]]);
  });
});

describe('消息解码', () => {
  it('头像、换页、换行、红字和多段', () => {
    // 段 1：头像 0x18，页 1 的「字 0x1a 0x1b」，FC 红 0x2c FC，FE 换行，0x2d，FF FF
    // 段 2：头像 0x01，F2 切页，0x05，FF 00
    const bytes = Uint8Array.from([0x18, 0xf1, 0x1a, 0x1b, 0xfc, 0x2c, 0xfc, 0xfe, 0x2d, 0xff, 0xff, 0x01, 0xf2, 0x05, 0xff, 0x00]);
    const { parts, bank } = decodeMessageAt(bytes, 0);
    expect(parts.length).toBe(2);
    expect(parts[0].portrait).toBe(0x18);
    expect(parts[0].pages[0].map((l) => l.map((g) => [g.bank, g.code, g.red]))).toEqual([
      [
        [1, 0x1a, false],
        [1, 0x1b, false],
        [1, 0x2c, true],
      ],
      [[1, 0x2d, false]],
    ]);
    expect(parts[1].portrait).toBe(1);
    expect(parts[1].pages[0][0][0]).toMatchObject({ bank: 2, code: 5 });
    expect(bank).toBe(2);
  });

  it('每行 16 字自动折行，每页 3 行', () => {
    const text = Array.from({ length: 16 * 4 + 3 }, (_, i) => i % 200);
    const bytes = Uint8Array.from([0x00, ...text, 0xff, 0x00]);
    const { parts } = decodeMessageAt(bytes, 0);
    const pages = parts[0].pages;
    expect(pages.length).toBe(2);
    expect(pages[0].map((l) => l.length)).toEqual([16, 16, 16]);
    expect(pages[1].map((l) => l.length)).toEqual([16, 3]);
  });
});

describe('旗标补丁解释器', () => {
  it('照原版代码按旗标和地图改属性层', () => {
    const { w16, w32, rom } = fakeRom();
    // 表 $1C5F2[1] → 0x1C700 的一段代码：
    //   move.l (a2),d1 ; cmpi.w #$0106,$FFE100 ; bne.w end
    //   move.w #$4242,$FFD054 ; btst #0,d1 ; beq.w end ; move.w #0,$FFD054 ; end: rts
    w32(0x1c5f2 + 4, 0x1c700);
    let p = 0x1c700;
    const emit = (...words: number[]) => {
      w16(p, ...words);
      p += words.length * 2;
    };
    emit(0x2212);
    emit(0x0c79, 0x0106, 0x00ff, 0xe100);
    const bne1 = p;
    emit(0x6600, 0);
    emit(0x33fc, 0x4242, 0x00ff, 0xd054);
    emit(0x0801, 0x0000);
    const beq = p;
    emit(0x6700, 0);
    emit(0x33fc, 0x0000, 0x00ff, 0xd054);
    const end = p;
    emit(0x4e75);
    w16(bne1 + 2, end - (bne1 + 2));
    w16(beq + 2, end - (beq + 2));

    const attr = new Uint8Array(100);
    applyFlagPatches(rom, 1, 0, 0x106, attr);
    expect([attr[0x54], attr[0x55]]).toEqual([0x42, 0x42]);
    const attr2 = new Uint8Array(100);
    applyFlagPatches(rom, 1, 1, 0x106, attr2);
    expect([attr2[0x54], attr2[0x55]]).toEqual([0, 0]);
    const attr3 = new Uint8Array(100);
    applyFlagPatches(rom, 1, 0, 0x100, attr3);
    expect(attr3[0x54]).toBe(0);
  });
});

describe('脚本机', () => {
  function host(log: string[]): VmHost {
    const rec =
      (name: string) =>
      (...a: unknown[]) => {
        log.push(`${name}(${a.map((x) => JSON.stringify(x)).join(',')})`);
      };
    const recP =
      (name: string) =>
      async (...a: unknown[]) => {
        log.push(`${name}(${a.map((x) => JSON.stringify(x)).join(',')})`);
      };
    return {
      message: recP('message'),
      moveTo: recP('moveTo'),
      moveCells: recP('moveCells'),
      face: rec('face'),
      step: recP('step'),
      setMap: rec('setMap'),
      loadMap: recP('loadMap'),
      battle: recP('battle'),
      placeObjects: rec('placeObjects'),
      removeObject: rec('removeObject'),
      clearObjects: rec('clearObjects'),
      setObjectPos: rec('setObjectPos'),
      setFlag: rec('setFlag'),
      join: rec('join'),
      advanceTalk: rec('advanceTalk'),
      setRegion: rec('setRegion'),
      setBattle: rec('setBattle'),
      wait: recP('wait'),
      fadeOut: recP('fadeOut'),
      fadeIn: recP('fadeIn'),
      setMode: rec('setMode'),
      emote: recP('emote'),
      search: recP('search'),
      worldMap: async () => 1,
      sound: rec('sound'),
      doorAnim: recP('doorAnim'),
      unknown: rec('unknown'),
    };
  }

  it('按顺序执行，参数和原版一样取', async () => {
    const { w16, rom } = fakeRom();
    w16(
      0x1000,
      ...[0x001e, 0x0001], // mode 1
      ...[0x0019, 0x0801, 0x0080, 0x0080, 0x0c00], // moveTo 槽 8 → (128,128)，最后朝右
      ...[0x001d, 0x0000], // 消息 0
      ...[0x0021, 0x0100], // 旗标 组1 位0
      ...[0x0023, 0x0001, 0x020c, 0x0040, 0x0080, 0xff02, 0x00ff], // 放人物 槽1
      ...[0x0012, 0x0100, 0x0106, 0x0013], // 换地图
      ...[0x0032, 0x0002], // 战斗编号 2
      0xffff,
    );
    const log: string[] = [];
    await new Vm(rom, host(log)).run(0x1000);
    expect(log).toEqual([
      'setMode(1)',
      'moveTo(8,[{"x":128,"y":128}],[12])',
      'message(0)',
      'setFlag(1,0,true)',
      'placeObjects([{"slot":1,"sprite":2,"anim":12,"x":64,"y":128,"mode":255,"talk":2}])',
      'setMap(256,262)',
      'loadMap()',
      'setBattle(2)',
    ]);
  });

  it('goto 标签往前往后找，switch 按选单结果跳', async () => {
    const { w16, rom } = fakeRom();
    w16(
      0x2000,
      ...[0x000e, 0xaaa1, 0x0000], // 往后跳到标签 AAA1
      ...[0x001d, 0x0063], // 被跳过
      0xaaa1,
      ...[0x0029], // 世界地图，返回 1
      ...[0x000d, 0xbbb0, 0xbbb1], // 按 1 跳到 BBB1
      0xbbb0,
      ...[0x001d, 0x0001],
      0xbbb1,
      ...[0x001d, 0x0002],
      0xffff,
    );
    const log: string[] = [];
    await new Vm(rom, host(log)).run(0x2000);
    expect(log).toEqual(['message(2)']);
  });

  it('变长指令的长度', () => {
    const { w16, rom } = fakeRom();
    w16(0x3000, 0x0019, 0x0003, 0, 0, 0, 0, 0, 0, 0, 0); // 3 个目标 + 3 字节补成 4
    expect(opLength(rom, 0x3000)).toBe(2 + 2 + 12 + 4);
    w16(0x3100, 0x001a, 0x0001, 0x0405, 0x0c00);
    expect(opLength(rom, 0x3100)).toBe(2 + 2 + 2 + 2);
    w16(0x3200, 0x0023, 0x0001, 0, 0, 0, 0, 0x0002, 0, 0, 0, 0, 0x00ff);
    expect(opLength(rom, 0x3200)).toBe(2 + 10 + 10 + 2);
  });
});

describe('战斗判定代码', () => {
  it('找出每场战斗会触发的事件', () => {
    const { w16, w32, rom } = fakeRom();
    w32(0x120e8, 0x12178);
    w32(0x120e8 + 4, 0x12200);
    w16(0x12178, 0x143c, 0x0044, 0x4eb9, 0x0001, 0x4144, 0x4e71, 0x143c, 0x0045, 0x4eb9, 0x0001, 0x4144, 0x143c, 0x0046, 0x4eb9, 0x0001, 0x4144);
    expect(battleEventCodes(rom, 0)).toEqual([0x44, 0x45, 0x46]);
  });
});

describe('ROM 附件', () => {
  it('文本容器来回转换，并核对校验', () => {
    const rom = new Uint8Array(0x20000);
    rom.set([0x53, 0x45, 0x47, 0x41], 0x100);
    for (let i = 0x200; i < rom.length; i++) rom[i] = (i * 7) & 255;
    const { info } = loadRomBytes(rom);
    const b64 = (x: Uint8Array) => {
      let s = '';
      for (const v of x) s += String.fromCharCode(v);
      return btoa(s);
    };
    const from64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const text = romToText(rom, info, '水浒传.md', b64);
    const back = romFromText(text, from64);
    expect(back.fileName).toBe('水浒传.md');
    expect(crc32(back.rom)).toBe(crc32(rom));
    const broken = text.replace(/\n(.)/, (_, c: string) => `\n${c === 'A' ? 'B' : 'A'}`);
    expect(() => romFromText(broken, from64)).toThrow(/校验/);
  });

  it('不认得的 ROM 不走原版模式', () => {
    expect(isKnownRom(new Uint8Array(0x200000))).toBe(false);
    const { w32, b } = fakeRom();
    w32(ADDR.sprites, 0x100400);
    w32(ADDR.portraits, 0x160138);
    w32(ADDR.mapLayout, 0x2941e);
    w32(ADDR.font, 0xae2c4);
    w32(ADDR.messages, 0xbcedc);
    expect(isKnownRom(b)).toBe(true);
  });
});
