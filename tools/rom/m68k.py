"""反汇编 ROM 里的 68000 代码：python3 m68k.py rom.md 0x27380 60"""
import sys
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_000

rom = open(sys.argv[1], 'rb').read()
start = int(sys.argv[2], 0)
count = int(sys.argv[3]) if len(sys.argv) > 3 else 40
md = Cs(CS_ARCH_M68K, CS_MODE_M68K_000)
n = 0
for ins in md.disasm(rom[start:start + count * 10], start):
    print(f'{ins.address:06x}  {ins.bytes.hex():<20} {ins.mnemonic} {ins.op_str}')
    n += 1
    if n >= count:
        break
