"""把 ROM 的一段按 MD 图块格式（8×8，每像素 4 bit，每块 32 字节）画成 PNG，用来找图。

用法：python3 tools/rom/tiles.py rom/xxx.bin --offset 0x40000 --count 1024 --cols 32 --scale 3 -o shots/tiles.png
      --palette 可以给 16 个 MD 颜色字（如 0EEE,0000,...），或者 ROM 里调色板的偏移（如 @0x1F000），不给就用灰阶。
"""
import argparse
from pathlib import Path

from PIL import Image


def md_color(word: int) -> tuple[int, int, int]:
    """MD 的颜色是 9 bit：0000 BBB0 GGG0 RRR0。"""
    r = (word >> 1) & 7
    g = (word >> 5) & 7
    b = (word >> 9) & 7
    return (r * 36, g * 36, b * 36)


def load_palette(arg: str | None, rom: bytes) -> list[tuple[int, int, int]]:
    if not arg:
        return [(i * 17, i * 17, i * 17) for i in range(16)]
    if arg.startswith("@"):
        at = int(arg[1:], 0)
        return [md_color(int.from_bytes(rom[at + i * 2 : at + i * 2 + 2], "big")) for i in range(16)]
    return [md_color(int(w, 16)) for w in arg.split(",")]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("rom")
    ap.add_argument("--offset", type=lambda v: int(v, 0), default=0)
    ap.add_argument("--count", type=int, default=1024)
    ap.add_argument("--cols", type=int, default=32)
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--palette")
    ap.add_argument("-o", "--out", default="shots/tiles.png")
    args = ap.parse_args()
    rom = Path(args.rom).read_bytes()
    pal = load_palette(args.palette, rom)
    count = min(args.count, (len(rom) - args.offset) // 32)
    rows = (count + args.cols - 1) // args.cols
    img = Image.new("RGB", (args.cols * 8, rows * 8))
    px = img.load()
    for t in range(count):
        base = args.offset + t * 32
        tx, ty = (t % args.cols) * 8, (t // args.cols) * 8
        for y in range(8):
            for x in range(8):
                b = rom[base + y * 4 + x // 2]
                idx = (b >> 4) if x % 2 == 0 else (b & 15)
                px[tx + x, ty + y] = pal[idx]
    if args.scale > 1:
        img = img.resize((img.width * args.scale, img.height * args.scale), Image.NEAREST)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"{out}: {count} 个图块，从 {args.offset:#x} 开始")


if __name__ == "__main__":
    main()
