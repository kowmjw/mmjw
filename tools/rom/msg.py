"""把原版消息渲染成图片（用 ROM 里的字库），方便阅读剧情。

    python3 msg.py rom.md 0 20 out.png
"""
import struct
import sys
from PIL import Image, ImageDraw

FONT_TABLE, MSG_TABLE = 0xAE2A4, 0xBC6E4


class Msg:
    def __init__(self, rom):
        self.b = rom
        self.banks = [self.u32(FONT_TABLE + i * 4) for i in range(8)]

    def u32(self, a): return struct.unpack('>I', self.b[a:a + 4])[0]

    def glyph(self, bank, code):
        a = self.banks[bank] + code * 32
        img = Image.new('1', (16, 16), 1)
        px = img.load()
        for t in range(4):
            tx, ty = (t % 2) * 8, (t // 2) * 8
            for y in range(8):
                v = self.b[a + t * 8 + y]
                for x in range(8):
                    if v >> (7 - x) & 1:
                        px[tx + x, ty + y] = 0
        return img

    def entries(self, addr, max_entries=40):
        """[(头像号, [[(bank, code, red)]] 按行)]"""
        b = self.b
        out = []
        bank = 0
        for _ in range(max_entries):
            portrait = b[addr]; addr += 1
            lines = [[]]
            red = False
            pos = 0
            while True:
                c = b[addr]; addr += 1
                if c == 0xFF:
                    cont = b[addr]; addr += 1
                    break
                if 0xF0 <= c <= 0xFB:
                    bank = c - 0xF0; continue
                if c == 0xFC:
                    red = not red; continue
                if c == 0xFD:
                    addr += 1; continue
                if c == 0xFE:
                    lines.append([]); pos = (pos // 16 + 1) * 16; continue
                if len(lines[-1]) == 16:
                    lines.append([])
                lines[-1].append((bank, c, red)); pos += 1
            out.append((portrait, lines))
            if cont != 0xFF:
                break
        return out

    def render(self, addr, title=''):
        ents = self.entries(addr)
        rows = sum(len(l) for _, l in ents) + len(ents)
        img = Image.new('RGB', (16 * 17 + 60, rows * 18 + 20), (255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((2, 2), title, fill=(0, 0, 200))
        y = 18
        for portrait, lines in ents:
            d.text((2, y + 2), f'p{portrait}', fill=(160, 0, 0))
            for line in lines:
                x = 40
                for bank, code, red in line:
                    g = self.glyph(bank, code).convert('RGB')
                    if red:
                        g = Image.eval(g, lambda v: v)
                        px = g.load()
                        for yy in range(16):
                            for xx in range(16):
                                if px[xx, yy] == (0, 0, 0): px[xx, yy] = (200, 0, 0)
                    img.paste(g, (x, y)); x += 17
                y += 18
            y += 4
        return img


if __name__ == '__main__':
    rom = open(sys.argv[1], 'rb').read()
    m = Msg(rom)
    a, b_ = int(sys.argv[2], 0), int(sys.argv[3], 0)
    imgs = [m.render(m.u32(MSG_TABLE + i * 4), f'msg {i}') for i in range(a, b_)]
    w = max(i.width for i in imgs)
    cols = 2
    col_h = [0] * cols
    placed = []
    for im in imgs:
        c = col_h.index(min(col_h))
        placed.append((im, c, col_h[c])); col_h[c] += im.height + 4
    out = Image.new('RGB', (w * cols + 10, max(col_h)), (220, 220, 220))
    for im, c, y in placed:
        out.paste(im, (c * (w + 10), y))
    out.save(sys.argv[4])
    print(out.size)
