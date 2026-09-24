"""打印 MD ROM 的头信息：机种、游戏名、序号、校验和、ROM/RAM 范围、存档（SRAM）信息、CRC32/SHA-1。

用法：python3 tools/rom/inspect_rom.py rom/xxx.bin
"""
import hashlib
import sys
import zlib
from pathlib import Path


def text(rom: bytes, start: int, length: int) -> str:
    raw = rom[start : start + length]
    return "".join(chr(c) if 0x20 <= c < 0x7F else "·" for c in raw).strip()


def u32(rom: bytes, at: int) -> int:
    return int.from_bytes(rom[at : at + 4], "big")


def main() -> None:
    rom = Path(sys.argv[1]).read_bytes()
    words = [int.from_bytes(rom[i : i + 2], "big") for i in range(0x200, len(rom) - 1, 2)]
    checksum = sum(words) & 0xFFFF
    header_sum = int.from_bytes(rom[0x18E:0x190], "big")
    print(f"大小        {len(rom)} 字节（{len(rom) / 1024 / 1024:.2f} MB）")
    print(f"CRC32       {zlib.crc32(rom) & 0xFFFFFFFF:08X}")
    print(f"SHA-1       {hashlib.sha1(rom).hexdigest()}")
    print(f"机种        {text(rom, 0x100, 16)}")
    print(f"版权        {text(rom, 0x110, 16)}")
    print(f"国内名      {text(rom, 0x120, 48)}")
    print(f"海外名      {text(rom, 0x150, 48)}")
    print(f"序号        {text(rom, 0x180, 14)}")
    print(f"校验和      头里 {header_sum:04X}，实际 {checksum:04X}{'' if header_sum == checksum else '（不一致）'}")
    print(f"手柄        {text(rom, 0x190, 16)}")
    print(f"ROM 范围    {u32(rom, 0x1A0):06X}-{u32(rom, 0x1A4):06X}")
    print(f"RAM 范围    {u32(rom, 0x1A8):06X}-{u32(rom, 0x1AC):06X}")
    if rom[0x1B0:0x1B2] == b"RA":
        print(f"存档 SRAM   {u32(rom, 0x1B4):06X}-{u32(rom, 0x1B8):06X}（类型 {rom[0x1B2]:02X}{rom[0x1B3]:02X}）")
    else:
        print("存档 SRAM   头里没有声明")
    print(f"地区        {text(rom, 0x1F0, 16)}")
    print(f"复位入口    {u32(rom, 4):06X}，初始栈 {u32(rom, 0):06X}")


if __name__ == "__main__":
    main()
