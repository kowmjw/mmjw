"""按原版的数据结构从 ROM 直接画出地图（不经过模拟器）。

地图编号 = (组, 序号)，四张指针表都按 [组][序号] 索引：
  0x293EA 排版（三段 RLE 流：上层 FFB000 / 地面 FFC000 / 属性 FFD000）
  0x770A6 大块定义（每块 32x32 像素 = 4x4 个图块，16 个字）
  0x32182 图块（读到显存 0x200 号开始，遇到 0x3402 结束）
  0xDD744 调色板（32 色，第 0、1 行）
入口表 0xDE088[组] + 序号*16：地图尺寸、镜头、主角位置等。
"""
import struct
from PIL import Image

T_LAYOUT, T_BLOCKS, T_TILES, T_PAL, T_ENTRY = 0x293EA, 0x770A6, 0x32182, 0xDD744, 0xDE088


class Rom:
    def __init__(self, path):
        self.b = open(path, 'rb').read()

    def u8(self, a): return self.b[a]
    def u16(self, a): return struct.unpack('>H', self.b[a:a + 2])[0]
    def u32(self, a): return struct.unpack('>I', self.b[a:a + 4])[0]

    def ptr2(self, table, g, m):
        return self.u32(self.u32(table + g * 4) + m * 4)

    def rle(self, p):
        """原版 0x2DC6 的解压：F0/F1 切换单字节/双字节模式，F2-FE 是重复次数，FF n 是长重复，FF 00 结束。"""
        out = bytearray(); mode = 0; b = self.b
        while True:
            c = b[p]; p += 1
            if c == 0xF0: mode = 0; continue
            if c == 0xF1: mode = 1; continue
            if c <= 0xEF: out.append(c); continue
            if c == 0xFF:
                n = b[p]; p += 1
                if n == 0: return bytes(out), p
            else:
                n = c & 0x0F
            if mode:
                out += bytes([b[p], b[p + 1]]) * n; p += 2
            else:
                out += bytes([b[p]]) * n; p += 1

    def layout(self, g, m):
        p = self.ptr2(T_LAYOUT, g, m)
        upper, p = self.rle(p)
        ground, p = self.rle(p)
        attr, p = self.rle(p)
        return upper, ground, attr

    def entry(self, g, i):
        a = self.u32(T_ENTRY + g * 4) + i * 16
        r = self.b[a:a + 16]
        return {'e106': r[0], 'e107': r[1], 'width': r[2], 'e109': r[3], 'camx': r[4] if r[4] < 128 else r[4] - 256,
                'camy': r[5] if r[5] < 128 else r[5] - 256, 'px': struct.unpack('>H', r[6:8])[0], 'py': struct.unpack('>H', r[8:10])[0],
                'e006': r[10], 'e001': r[11], 'e10a': r[12], 'e10b': r[13], 'e10c': r[14], 'raw': r.hex()}

    def tiles(self, a):
        end = a
        while self.u16(end) != 0x3402: end += 2
        return self.b[a:end]

    def palette(self, a, n):
        out = []
        for i in range(n):
            w = self.u16(a + i * 2)
            out.append((((w >> 1) & 7) * 255 // 7, ((w >> 5) & 7) * 255 // 7, ((w >> 9) & 7) * 255 // 7))
        return out

    def render_map(self, g, m, width, layers=('ground', 'upper')):
        vram = bytearray(0x10000)
        t = self.tiles(self.ptr2(T_TILES, g, m))
        vram[0x200 * 32:0x200 * 32 + len(t)] = t[:0x10000 - 0x200 * 32]
        pal = self.palette(self.ptr2(T_PAL, g, m), 32) + [(255, 0, 255)] * 32
        blocks = self.ptr2(T_BLOCKS, g, m)
        upper, ground, attr = self.layout(g, m)
        h = (len(ground) + width - 1) // width
        img = Image.new('RGB', (width * 32, h * 32))
        from vram import draw_tile
        for name in layers:
            data = ground if name == 'ground' else upper
            for i, k in enumerate(data):
                bx, by = (i % width) * 32, (i // width) * 32
                if by >= img.height: break
                for j in range(16):
                    v = self.u16(blocks + k * 32 + j * 2)
                    if name == 'upper' and (v & 0x7FF) == 0: continue
                    draw_tile(img, vram, pal, v & 0x7FF, (v >> 13) & 1, bx + (j % 4) * 8, by + (j // 4) * 8,
                              bool(v & 0x800), bool(v & 0x1000), transparent=(name == 'upper'))
        return img, (upper, ground, attr)
