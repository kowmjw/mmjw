// 存档放在浏览器本地（localStorage）。有的环境（无痕模式、嵌入页面）读写会失败，
// 这时退回到内存里存，至少本次打开期间能用；另外提供导出/导入存档文件。

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

function write(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

export const AUTO_SLOT = 0;
export const SLOT_COUNT = 4; // 0 = 自动存档，1-3 = 手动存档

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

export function hasAnySave() {
  for (let i = 0; i < SLOT_COUNT; i++) if (slotMeta(i)) return true;
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
