"""从马善政毛笔楷书（OFL 许可）里提取标题、章节名等大字的轮廓，生成 src/art/brushGlyphs.ts。

运行：pip install fonttools brotli && python3 tools/extract_glyphs.py
坐标单位：1 em = 1000，y 轴向下，原点在字身框左上角。
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2"
OUT = ROOT / "src/art/brushGlyphs.ts"

# 需要用毛笔字显示的字：标题、章节卡、回合与胜负横幅。
CHARS = "水浒传序章第一二三史家村之战智取生辰纲敬请期待胜利败北我军敌回合完终"


def main() -> None:
    font = TTFont(str(FONT))
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    upem = font["head"].unitsPerEm
    ascent = font["hhea"].ascent
    scale = 1000 / upem
    lines = []
    for ch in dict.fromkeys(CHARS):
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit(f"字体里没有「{ch}」")
        pen = SVGPathPen(glyphs, ntos=lambda v: str(round(v)))
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, 0, ascent * scale)))
        lines.append(f"  '{ch}': {{ adv: {round(glyphs[name].width * scale)}, d: '{pen.getCommands()}' }},")
    OUT.write_text(
        "// 由 tools/extract_glyphs.py 生成，请勿手改。\n"
        "// 字形来自马善政毛笔楷书（Ma Shan Zheng），SIL Open Font License 1.1。\n"
        "export const BRUSH_GLYPHS: Record<string, { adv: number; d: string }> = {\n"
        + "\n".join(lines)
        + "\n};\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(lines)} glyphs, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
