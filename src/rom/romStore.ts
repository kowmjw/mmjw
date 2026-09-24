// 导入的 ROM 存在手机/电脑浏览器本地（IndexedDB），不会上传，除非玩家在界面里选择「上传给 Claude 分析」。
import { claudeRuntime } from '../engine/storage';
import { loadRomBytes, romToText, type LoadedRom, type RomInfo } from './romfile';

const DB_NAME = 'shuihu-remake';
const STORE = 'rom';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRom(rom: Uint8Array, fileName: string): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ rom, fileName, savedAt: Date.now() }, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadSavedRom(): Promise<(LoadedRom & { fileName: string }) | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<{ rom: Uint8Array; fileName: string } | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
      req.onsuccess = () => resolve(req.result as { rom: Uint8Array; fileName: string } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec) return null;
    return { ...loadRomBytes(new Uint8Array(rec.rom)), fileName: rec.fileName };
  } catch {
    return null;
  }
}

/** 弹出系统的选文件框（必须在按钮点击里直接调用，手机浏览器才允许）。 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface AssetsApi {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; sizeBytes: number }>;
}
interface DbApi {
  doc(path: string): { set(data: Record<string, unknown>): Promise<void> };
}
interface UserApi {
  id(): Promise<string | null>;
}

/** 能不能上传（只有在 claude.ai 里、并且有写权限时才行）。 */
export async function canUploadRom() {
  const runtime = claudeRuntime();
  if (!runtime) return false;
  return (await runtime.use('assets')) !== null;
}

/** 把 ROM 作为文本附件存进这个游戏页面，给 Claude 读取分析。成功返回附件 id。 */
export async function uploadRomForAnalysis(rom: Uint8Array, info: RomInfo, fileName: string): Promise<string> {
  const runtime = claudeRuntime();
  const assets = runtime ? ((await runtime.use('assets')) as AssetsApi | null) : null;
  if (!runtime || !assets) throw new Error('只有在 claude.ai 里打开游戏时才能上传');
  const text = romToText(rom, info, fileName, toBase64);
  let res: { id: string };
  try {
    res = await assets.upload(new Blob([text], { type: 'text/plain' }), { type: 'text/plain' });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new Error(code === 'too_large' ? 'ROM 太大，超过了上传上限' : code === 'rate_limited' ? '上传太频繁了，等一会儿再试' : `上传失败（${code ?? '未知原因'}）`);
  }
  // 记下附件 id（每位玩家私有），页面重开后还能知道传过什么
  try {
    const [db, user] = (await Promise.all([runtime.use('db'), runtime.use('user')])) as [DbApi | null, UserApi | null];
    const uid = user ? await user.id() : null;
    if (db && uid) await db.doc(`data/users/${uid}/rom`).set({ assetId: res.id, fileName, size: info.size, crc32: info.crc32, uploadedAt: Date.now() });
  } catch {
    // 记录失败不影响上传本身
  }
  return res.id;
}
