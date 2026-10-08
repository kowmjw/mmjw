"""把剧情和界面里用到的字从 GNU Unifont 转成 16×16 点阵，生成 src/generated/pixelfont.ts。

原版字库只有游戏里用到的 1920 个字，新写的剧情很多字没有，所以新文字统一用 Unifont
（和原版一样是 16×16 点阵）。只收录用到的字，数据几十 KB。

    python3 tools/font/build_pixel_font.py

剧情或界面文字改了以后要重新跑一次（测试会检查有没有漏字）。
字体许可证：SIL OFL 1.1，见 tools/font/UNIFONT-OFL.txt。
"""
import base64
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = ROOT / 'node_modules/@fontsource/unifont/files/unifont-latin-400-normal.woff'
OUT = ROOT / 'src/generated/pixelfont.ts'
# 扫描这些目录里的全部 .ts 文件（包括注释，多收几个字没关系）
SCAN = ['src/orig', 'src/rom/names.ts']
# 另外总是收录的字：ASCII、全角空格、常用标点、数字
EXTRA = ''.join(chr(c) for c in range(0x20, 0x7F)) + '\u3000，。！？、；：「」『』（）…—～·《》“”‘’０１２３４５６７８９'


def collect():
    chars = set(EXTRA)
    for rel in SCAN:
        p = ROOT / rel
        files = [p] if p.is_file() else sorted(p.rglob('*.ts'))
        for f in files:
            for ch in f.read_text(encoding='utf-8'):
                if ord(ch) >= 0x2000 and not ch.isspace():
                    chars.add(ch)
    return sorted(chars)


def main():
    font = ImageFont.truetype(str(FONT), 16)
    chars = collect()
    data = bytearray()
    widths = []
    for ch in chars:
        w = 8 if font.getlength(ch) <= 8 else 16
        img = Image.new('L', (16, 16), 0)
        ImageDraw.Draw(img).text((0, 0), ch, font=font, fill=255)
        px = img.load()
        for y in range(16):
            row = 0
            for x in range(16):
                if px[x, y] >= 128:
                    row |= 0x8000 >> x
            data += row.to_bytes(2, 'big')
        widths.append('1' if w == 16 else '0')
    text = ''.join(chars)
    escaped = text.replace('\\', '\\\\').replace("'", "\\'")
    b64 = base64.b64encode(bytes(data)).decode()
    lines = [b64[i:i + 120] for i in range(0, len(b64), 120)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        '// 自动生成，不要手改：python3 tools/font/build_pixel_font.py\n'
        '// 字形来自 GNU Unifont（SIL OFL 1.1，见 tools/font/UNIFONT-OFL.txt）。\n'
        '// 每个字 16 行 × 2 字节，最高位在左；FONT_WIDE 里 1 表示全角（16 像素宽），0 表示半角（8 像素宽）。\n\n'
        f"export const FONT_CHARS = '{escaped}';\n\n"
        f"export const FONT_WIDE = '{''.join(widths)}';\n\n"
        'export const FONT_DATA =\n' + ' +\n'.join(f"  '{line}'" for line in lines) + ';\n',
        encoding='utf-8',
    )
    print(f'{len(chars)} 个字，{len(data)} 字节 → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
