import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/rom/romfile';
import { archiveKind, extractRomFromZip } from '../src/rom/unzip';

async function deflateRaw(data: Uint8Array) {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 按 zip 格式手工拼一个压缩包（本地文件头 + 中央目录 + 结尾记录）。 */
async function makeZip(files: { name: string; data: Uint8Array; deflate?: boolean }[]) {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.deflate ? await deflateRaw(f.data) : f.data;
    const method = f.deflate ? 8 : 0;
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const rom = Uint8Array.from({ length: 0x8000 }, (_, i) => (i * 31) & 0xff);

describe('从压缩包里取 ROM', () => {
  it('认得出 zip、rar、7z', async () => {
    expect(archiveKind(await makeZip([{ name: 'a.bin', data: rom }]))).toBe('zip');
    expect(archiveKind(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a]))).toBe('rar');
    expect(archiveKind(new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBe('7z');
    expect(archiveKind(rom)).toBeNull();
  });

  it('跳过说明文件，取出压缩过的 ROM', async () => {
    const zip = await makeZip([
      { name: '说明.txt', data: new TextEncoder().encode('x'.repeat(50000)) },
      { name: '水浒传/水浒传.md', data: rom, deflate: true },
    ]);
    const got = await extractRomFromZip(zip);
    expect(got.name).toBe('水浒传/水浒传.md');
    expect(got.data).toEqual(rom);
  });

  it('没有 ROM 扩展名时取最大的文件（不压缩的也行）', async () => {
    const zip = await makeZip([
      { name: 'readme', data: new Uint8Array(10) },
      { name: 'game', data: rom },
    ]);
    const got = await extractRomFromZip(zip);
    expect(got.name).toBe('game');
    expect(got.data).toEqual(rom);
  });
});
