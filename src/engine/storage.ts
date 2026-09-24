// 存档放在浏览器本地（localStorage）。有的环境（无痕模式、嵌入页面）读写会失败，
// 这时退回到内存里存，至少本次打开期间能用；另外提供导出/导入存档文件。
// 在 claude.ai 上作为 Artifact 打开时，还会同步一份到平台的数据库（每位玩家私有），
// 换设备或清了浏览器数据也不会丢。

const PREFIX = 'shuihu-remake:';
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    // 忽略，用内存里的
  }
  return memory.get(key) ?? null;
}

function writeLocal(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

function write(key: string, value: string): boolean {
  const ok = writeLocal(key, value);
  cloudWrite(key, value);
  return ok || cloud !== null;
}

// ───────── 云端同步（claude.ai Artifact 的 db 能力） ─────────

interface CloudDoc {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface CloudDb {
  doc(path: string): CloudDoc;
}
interface CloudUser {
  id(): Promise<string | null>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

let cloud: { db: CloudDb; uid: string } | null = null;
const pending = new Map<string, Promise<void>>();

function cloudWrite(key: string, value: string) {
  const c = cloud;
  if (!c) return;
  // 同一个文档一次只写一个，按顺序排队
  const prev = pending.get(key) ?? Promise.resolve();
  const next = prev.then(() => c.db.doc(`data/users/${c.uid}/${key}`).set({ json: value })).catch(() => {});
  pending.set(key, next);
}

function savedAt(raw: string | null | undefined) {
  if (!raw) return 0;
  try {
    return (JSON.parse(raw) as { meta?: { savedAt?: number } }).meta?.savedAt ?? 0;
  } catch {
    return 0;
  }
}

/** 把一条诊断记录写到玩家自己的云端空间（只有这位玩家和页面能看到），出问题时方便排查。 */
export function cloudDiag(key: string, data: Record<string, unknown>) {
  cloudWrite(`diag-${key}`, JSON.stringify({ ...data, at: new Date().toISOString() }));
}

export function claudeRuntime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/** 在 claude.ai 里打开时，把本地存档和云端存档对齐（各取较新的）。返回是否连上了云端。 */
export async function connectCloudSaves(): Promise<boolean> {
  const runtime = claudeRuntime();
  if (!runtime) return false;
  try {
    const [db, user] = (await Promise.all([runtime.use('db'), runtime.use('user')])) as [CloudDb | null, CloudUser | null];
    const uid = db && user ? await user.id() : null;
    if (!db || !uid) return false;
    const keys = [...Array.from({ length: SLOT_COUNT }, (_, i) => `slot${i}`), ...Array.from({ length: SLOT_COUNT }, (_, i) => `slot${ORIG_SLOT_BASE + i}`), 'settings'];
    const remote = await Promise.all(
      keys.map(async (key) => {
        const snap = await db.doc(`data/users/${uid}/${key}`).get();
        const json = snap.exists ? snap.data()?.json : undefined;
        return typeof json === 'string' ? json : null;
      }),
    );
    cloud = { db, uid };
    keys.forEach((key, i) => {
      const local = read(key);
      const r = remote[i];
      if (key === 'settings') {
        if (r && !local) writeLocal(key, r);
        else if (local && !r) cloudWrite(key, local);
      } else if (r && savedAt(r) > savedAt(local)) {
        writeLocal(key, r);
      } else if (local && savedAt(local) > savedAt(r)) {
        cloudWrite(key, local);
      }
    });
    Object.assign(settings, loadSettings());
    return true;
  } catch {
    cloud = null;
    return false;
  }
}

export const AUTO_SLOT = 0;
export const SLOT_COUNT = 4; // 0 = 自动存档，1-3 = 手动存档
/** 原版模式的存档另外放在 10–13 号，和旧的复刻剧情分开 */
export const ORIG_SLOT_BASE = 10;

export interface SlotMeta {
  slot: number;
  savedAt: number;
  chapter: string;
  place: string;
  playTime: number;
}

interface SlotFile<T> {
  meta: SlotMeta;
  data: T;
}

export function saveSlot<T>(slot: number, meta: Omit<SlotMeta, 'slot' | 'savedAt'>, data: T): boolean {
  const file: SlotFile<T> = { meta: { ...meta, slot, savedAt: Date.now() }, data };
  return write(`slot${slot}`, JSON.stringify(file));
}

export function loadSlot<T>(slot: number): T | null {
  const raw = read(`slot${slot}`);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as SlotFile<T>).data;
  } catch {
    return null;
  }
}

export function slotMeta(slot: number): SlotMeta | null {
  const raw = read(`slot${slot}`);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as SlotFile<unknown>).meta;
  } catch {
    return null;
  }
}

export function hasAnySave(base = 0) {
  for (let i = 0; i < SLOT_COUNT; i++) if (slotMeta(base + i)) return true;
  return false;
}

/** 把全部存档打包成一个 JSON 文本，用来导出备份。 */
export function exportSaves(): string {
  const all: Record<string, unknown> = {};
  for (let i = 0; i < SLOT_COUNT; i++) {
    const raw = read(`slot${i}`);
    if (raw) all[`slot${i}`] = JSON.parse(raw);
  }
  return JSON.stringify({ game: 'shuihu-remake', version: 1, saves: all });
}

/** 导入 exportSaves 导出的文本，返回导入了几个存档。 */
export function importSaves(text: string): number {
  const parsed = JSON.parse(text) as { game?: string; saves?: Record<string, unknown> };
  if (parsed.game !== 'shuihu-remake' || !parsed.saves) throw new Error('不是本游戏的存档文件');
  let n = 0;
  for (const [key, value] of Object.entries(parsed.saves)) {
    if (!/^slot\d$/.test(key)) continue;
    write(key, JSON.stringify(value));
    n++;
  }
  return n;
}

export interface Settings {
  sound: boolean;
  /** 每秒显示几个字 */
  textSpeed: number;
}

const DEFAULT_SETTINGS: Settings = { sound: true, textSpeed: 40 };

export function loadSettings(): Settings {
  const raw = read('settings');
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings: Settings = loadSettings();

export function saveSettings() {
  write('settings', JSON.stringify(settings));
}
