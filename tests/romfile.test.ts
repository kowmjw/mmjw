import { describe, expect, it } from 'vitest';
import { binToSmd, crc32, isSmd, loadRomBytes, mdChecksum, romToText, smdToBin } from '../src/rom/romfile';

/** 造一个假的 MD ROM：带 SEGA 头、游戏名和正确的校验和。 */
function fakeRom(size = 0x40000) {
  const rom = new Uint8Array(size);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (rom[at + i] = c.charCodeAt(0)));
  put(0x100, 'SEGA MEGA DRIVE ');
  put(0x120, 'SHUI HU ZHUAN');
  put(0x180, 'GM 00000000-00');
  rom[0x1b0] = 0x52;
  rom[0x1b1] = 0x41;
  for (let i = 0x200; i < size; i++) rom[i] = (i * 7) & 0xff;
  const sum = mdChecksum(rom);
  rom[0x18e] = sum >> 8;
  rom[0x18f] = sum & 0xff;
  return rom;
}

describe('ROM 文件识别', () => {
  it('CRC32 与标准值一致', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('读出头信息、校验和、电池存档标记', () => {
    const { info } = loadRomBytes(fakeRom());
    expect(info.system).toBe('SEGA MEGA DRIVE');
    expect(info.domesticName).toBe('SHUI HU ZHUAN');
    expect(info.checksum).toBe(info.headerChecksum);
    expect(info.sram).toBe(true);
    expect(info.wasSmd).toBe(false);
    expect(info.crc32).toMatch(/^[0-9A-F]{8}$/);
  });

  it('SMD 交错格式能自动转回普通格式', () => {
    const rom = fakeRom();
    const smd = binToSmd(rom);
    expect(isSmd(smd)).toBe(true);
    expect(smdToBin(smd)).toEqual(rom);
    const loaded = loadRomBytes(smd);
    expect(loaded.info.wasSmd).toBe(true);
    expect(loaded.info.crc32).toBe(loadRomBytes(rom).info.crc32);
  });

  it('不是 ROM 的文件给出中文说明', () => {
    expect(() => loadRomBytes(new Uint8Array(100))).toThrow('文件太小');
    expect(() => loadRomBytes(new Uint8Array(0x12345))).toThrow('SEGA');
  });

  it('上传用的文本容器第一行是说明，第二行是 base64', () => {
    const rom = fakeRom(0x1000);
    const { info } = loadRomBytes(rom);
    const text = romToText(rom, info, 'shuihu.bin', (b) => btoa(String.fromCharCode(...b)));
    const [head, body] = text.split('\n');
    expect(JSON.parse(head)).toMatchObject({ format: 'shuihu-rom-base64', fileName: 'shuihu.bin', size: 0x1000 });
    expect(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))).toEqual(rom);
  });
});
