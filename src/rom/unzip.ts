// 从 zip 压缩包里取出 ROM（网上下载的 ROM 常常是 zip）。只支持普通的存储和 deflate 压缩，
// 解压用浏览器自带的 DecompressionStream。RAR、7z 这类格式需要玩家先自己解压。

export type ArchiveKind = 'zip' | 'rar' | '7z' | null;

export function archiveKind(b: Uint8Array): ArchiveKind {
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf) return '7z';
  return null;
}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const ROM_EXT = /\.(bin|md|gen|smd|68k|sg)$/i;

function listEntries(b: Uint8Array): Entry[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('压缩包损坏了，读不出里面的文件');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('压缩包损坏了，读不出里面的文件');
    const flags = view.getUint16(p + 8, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const rawName = b.subarray(p + 46, p + 46 + nameLen);
    let name: string;
    try {
      name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gbk').decode(rawName);
    } catch {
      name = new TextDecoder().decode(rawName);
    }
    entries.push({
      name,
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 从 zip 里挑出 ROM：优先 ROM 扩展名，其次最大的文件。 */
export async function extractRomFromZip(b: Uint8Array): Promise<{ name: string; data: Uint8Array }> {
  const files = listEntries(b).filter((e) => !e.name.endsWith('/') && e.size > 0);
  if (!files.length) throw new Error('压缩包里是空的');
  const roms = files.filter((e) => ROM_EXT.test(e.name));
  const pick = (roms.length ? roms : files).reduce((a, e) => (e.size > a.size ? e : a));
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (view.getUint32(pick.offset, true) !== 0x04034b50) throw new Error('压缩包损坏了，读不出里面的文件');
  const start = pick.offset + 30 + view.getUint16(pick.offset + 26, true) + view.getUint16(pick.offset + 28, true);
  const raw = b.subarray(start, start + pick.compressedSize);
  if (pick.method === 0) return { name: pick.name, data: raw.slice() };
  if (pick.method === 8) return { name: pick.name, data: await inflate(raw) };
  throw new Error('这个压缩包用了不支持的压缩方式，请先解压，再选里面的 ROM 文件');
}
