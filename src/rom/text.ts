// 原版消息（对话）的解码。格式见 docs/rom-notes.md：
// 一条消息由若干段组成：[头像号][文字…] FF [续]，续 = FF 还有下一段，00 结束。
// 文字码：00–EF 当前字库页的字，F0–FB 换页，FC 红色高亮开关，FD n 停顿，FE 换行。
// 每行 16 个字，每页 3 行。

import { ADDR, RomData } from './data';

export interface Glyph {
  bank: number;
  code: number;
  red: boolean;
}

export type Line = Glyph[];

export interface MessagePart {
  /** 头像号：0 没有头像，否则是头像表的第 (n-1) 张 */
  portrait: number;
  /** 分好页的文字，每页最多 3 行、每行最多 16 个字 */
  pages: Line[][];
}

export const LINE_CHARS = 16;
export const PAGE_LINES = 3;

/** 解码从 a 开始的一条消息。bank 是开头的字库页（原版里跨段、跨消息都保持上一次的页）。 */
export function decodeMessageAt(b: Uint8Array, a: number, bank = 0): { parts: MessagePart[]; bank: number } {
  const parts: MessagePart[] = [];
  for (let guard = 0; guard < 64; guard++) {
    const portrait = b[a++];
    const lines: Line[] = [[]];
    let red = false;
    let cont = 0;
    for (let n = 0; n < 4096; n++) {
      const c = b[a++];
      if (c === 0xff) {
        cont = b[a++];
        break;
      }
      if (c >= 0xf0 && c <= 0xfb) {
        bank = c - 0xf0;
        continue;
      }
      if (c === 0xfc) {
        red = !red;
        continue;
      }
      if (c === 0xfd) {
        a++;
        continue;
      }
      if (c === 0xfe) {
        lines.push([]);
        continue;
      }
      if (lines[lines.length - 1].length >= LINE_CHARS) lines.push([]);
      lines[lines.length - 1].push({ bank, code: c, red });
    }
    // 去掉最后的空行（换行码结尾时）
    while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    const pages: Line[][] = [];
    for (let i = 0; i < lines.length; i += PAGE_LINES) pages.push(lines.slice(i, i + PAGE_LINES));
    parts.push({ portrait, pages });
    if (cont !== 0xff) break;
  }
  return { parts, bank };
}

export function messageAddr(rom: RomData, id: number) {
  return rom.u32(ADDR.messages + id * 4);
}

/** 跟 NPC 说话的消息：表 $DEB4C[对话号] 是按剧情进度排的消息指针。 */
export function talkAddr(rom: RomData, talk: number, stage: number) {
  return rom.u32(rom.u32(ADDR.talk + talk * 4) + stage * 4);
}
