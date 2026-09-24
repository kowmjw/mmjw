// 世嘉 MD ROM 文件的识别和解析（纯逻辑，不依赖浏览器，方便测试）。
// 头信息在 $100-$1FF：机种名、游戏名、序号、校验和、ROM 范围、存档（SRAM）信息。

export interface RomInfo {
  size: number;
  /** $100 的机种名，比如 SEGA MEGA DRIVE */
  system: string;
  domesticName: string;
  overseasName: string;
  serial: string;
  /** 头里记录的校验和 */
  headerChecksum: number;
  /** 按 MD 规则算出来的校验和（$200 到结尾按 16 位字相加） */
  checksum: number;
  /** 头里声明了电池存档（"RA"） */
  sram: boolean;
  crc32: string;
  /** 原文件是 SMD 交错格式（已经转换成普通格式） */
  wasSmd: boolean;
  /** $100 处是不是 "SEGA"（大多数卡带都有，没有的话多半不是 MD ROM） */
  hasSegaTag: boolean;
}

function ascii(rom: Uint8Array, start: number, len: number) {
  let s = '';
  for (let i = start; i < start + len && i < rom.length; i++) {
    const c = rom[i];
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** SMD 格式：512 字节文件头，之后每 16KB 一块，前 8KB 是奇数地址字节，后 8KB 是偶数地址字节。 */
export function isSmd(buf: Uint8Array) {
  return buf.length > 512 && (buf.length - 512) % 16384 === 0 && buf[8] === 0xaa && buf[9] === 0xbb;
}

export function smdToBin(buf: Uint8Array): Uint8Array {
  const body = buf.subarray(512);
  const out = new Uint8Array(body.length);
  for (let b = 0; b < body.length; b += 16384) {
    for (let i = 0; i < 8192; i++) {
      out[b + i * 2 + 1] = body[b + i];
      out[b + i * 2] = body[b + 8192 + i];
    }
  }
  return out;
}

/** 普通格式 → SMD（只用于测试）。 */
export function binToSmd(rom: Uint8Array): Uint8Array {
  const size = Math.ceil(rom.length / 16384) * 16384;
  const out = new Uint8Array(512 + size);
  out[0] = size / 16384;
  out[1] = 3;
  out[8] = 0xaa;
  out[9] = 0xbb;
  out[10] = 6;
  for (let b = 0; b < size; b += 16384) {
    for (let i = 0; i < 8192; i++) {
      out[512 + b + i] = rom[b + i * 2 + 1] ?? 0;
      out[512 + b + 8192 + i] = rom[b + i * 2] ?? 0;
    }
  }
  return out;
}

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function mdChecksum(rom: Uint8Array) {
  let sum = 0;
  for (let i = 0x200; i + 1 < rom.length; i += 2) sum = (sum + ((rom[i] << 8) | rom[i + 1])) & 0xffff;
  return sum;
}

export interface LoadedRom {
  rom: Uint8Array;
  info: RomInfo;
}

/** 读入用户选的文件内容：自动转换 SMD，检查大小和头信息。不像 MD ROM 时抛出带中文说明的错误。 */
export function loadRomBytes(buf: Uint8Array): LoadedRom {
  if (buf.length < 0x200) throw new Error('文件太小，不是 MD 的 ROM');
  if (buf.length > 8 * 1024 * 1024 + 512) throw new Error('文件太大，不像 MD 的 ROM（MD 卡带最大 8MB 左右）');
  const wasSmd = isSmd(buf);
  const rom = wasSmd ? smdToBin(buf) : buf;
  const hasSegaTag = ascii(rom, 0x100, 4) === 'SEGA';
  if (!hasSegaTag && rom.length % 0x10000 !== 0) throw new Error('看起来不是 MD 的 ROM（没有找到 SEGA 标记）');
  const info: RomInfo = {
    size: rom.length,
    system: ascii(rom, 0x100, 16),
    domesticName: ascii(rom, 0x120, 48),
    overseasName: ascii(rom, 0x150, 48),
    serial: ascii(rom, 0x180, 14),
    headerChecksum: (rom[0x18e] << 8) | rom[0x18f],
    checksum: mdChecksum(rom),
    sram: rom[0x1b0] === 0x52 && rom[0x1b1] === 0x41,
    crc32: crc32(rom).toString(16).toUpperCase().padStart(8, '0'),
    wasSmd,
    hasSegaTag,
  };
  return { rom, info };
}

/** 上传给 Claude 分析用的文本容器：第一行是说明，后面是 base64。 */
export function romToText(rom: Uint8Array, info: RomInfo, fileName: string, toBase64: (bytes: Uint8Array) => string) {
  const meta = { format: 'shuihu-rom-base64', version: 1, fileName, size: info.size, crc32: info.crc32, wasSmd: info.wasSmd };
  return `${JSON.stringify(meta)}\n${toBase64(rom)}\n`;
}
