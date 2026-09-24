"""把模拟器里的显存画成图：整张 64KB 的图块表、A/B 两层背景、精灵表。"""
from PIL import Image


def tile_pixels(vram, index):
    base = (index & 0x7FF) * 32
    rows = []
    for y in range(8):
        row = []
        for x in range(4):
            b = vram[base + y * 4 + x]
            row += [b >> 4, b & 15]
        rows.append(row)
    return rows


def draw_tile(img, vram, pal, index, line, px, py, hflip=False, vflip=False, transparent=False):
    t = tile_pixels(vram, index)
    put = img.load()
    for y in range(8):
        for x in range(8):
            c = t[7 - y if vflip else y][7 - x if hflip else x]
            if transparent and c == 0:
                continue
            put[px + x, py + y] = pal[line * 16 + c]


def tile_sheet(vram, pal, line=0, cols=32, scale=2):
    img = Image.new('RGB', (cols * 8, (2048 // cols) * 8))
    for i in range(2048):
        draw_tile(img, vram, pal, i, line, (i % cols) * 8, (i // cols) * 8)
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def plane(vram, pal, base, w, h):
    img = Image.new('RGB', (w * 8, h * 8))
    for ty in range(h):
        for tx in range(w):
            a = base + (ty * w + tx) * 2
            v = (vram[a] << 8) | vram[a + 1]
            draw_tile(img, vram, pal, v & 0x7FF, (v >> 13) & 3, tx * 8, ty * 8, bool(v & 0x800), bool(v & 0x1000))
    return img


def sprites(vram, sat_base, limit=80):
    out = []
    i = 0
    for _ in range(limit):
        a = sat_base + i * 8
        y = ((vram[a] << 8) | vram[a + 1]) & 0x3FF
        size = vram[a + 2]
        link = vram[a + 3] & 0x7F
        attr = (vram[a + 4] << 8) | vram[a + 5]
        x = ((vram[a + 6] << 8) | vram[a + 7]) & 0x1FF
        out.append({'i': i, 'x': x - 128, 'y': y - 128, 'w': ((size >> 2) & 3) + 1, 'h': (size & 3) + 1,
                    'tile': attr & 0x7FF, 'pal': (attr >> 13) & 3, 'hf': bool(attr & 0x800), 'vf': bool(attr & 0x1000),
                    'pri': bool(attr & 0x8000)})
        i = link
        if link == 0:
            break
    return out
