"""把游戏页面「导入 ROM → 上传」得到的文本附件还原成 ROM 文件。

用法：python3 tools/rom/unpack_upload.py <附件文本> [输出路径，默认 rom/<原文件名>]
ROM 只放在本地的 rom/ 目录（已写进 .gitignore），不要提交到仓库。
"""
import base64
import json
import sys
import zlib
from pathlib import Path


def main() -> None:
    src = Path(sys.argv[1])
    head, body = src.read_text(encoding="utf-8").split("\n", 1)
    meta = json.loads(head)
    if meta.get("format") != "shuihu-rom-base64":
        raise SystemExit("不是游戏页面上传的 ROM 附件")
    rom = base64.b64decode(body.strip())
    crc = f"{zlib.crc32(rom) & 0xFFFFFFFF:08X}"
    if len(rom) != meta["size"] or crc != meta["crc32"]:
        raise SystemExit(f"数据不完整：大小 {len(rom)}/{meta['size']}，CRC32 {crc}/{meta['crc32']}")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("rom") / Path(meta["fileName"]).name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(rom)
    print(f"{out}: {len(rom)} 字节，CRC32 {crc}")


if __name__ == "__main__":
    main()
