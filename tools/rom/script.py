"""反汇编原版事件脚本（格式见 docs/rom-notes.md）。

    python3 script.py rom.md 1        # 列出第 1 组的全部事件脚本
"""
import struct
import sys

ARGS = {  # 固定长度参数（字节数，不含指令号）
    0x00: 2, 0x01: 2, 0x02: 0, 0x03: 0, 0x04: 0, 0x05: 66, 0x06: 0, 0x07: 2, 0x08: 0, 0x09: 0,
    0x0a: 0, 0x0b: 0, 0x0c: 0, 0x0f: 0, 0x10: 0, 0x11: 0, 0x12: 4, 0x13: 0, 0x14: 0,
    0x15: 2, 0x16: 2, 0x17: 0, 0x18: 2, 0x1b: 2, 0x1c: 4, 0x1d: 2, 0x1e: 2, 0x1f: 2,
    0x20: 2, 0x21: 2, 0x22: 2, 0x24: 2, 0x25: 6, 0x26: 2, 0x27: 0, 0x28: 2, 0x29: 0,
    0x2a: 6, 0x2b: 2, 0x2c: 2, 0x2d: 2, 0x31: 2, 0x32: 2, 0x33: 6, 0x34: 0, 0x36: 2,
    0x37: 0, 0x38: 0, 0x39: 0, 0x3a: 2, 0x3b: 2, 0x3c: 2, 0x3d: 2, 0x3e: 4, 0x3f: 2,
    0x40: 4, 0x41: 0, 0x42: 2, 0x44: 0, 0x45: 0, 0x46: 0, 0x47: 0, 0x48: 0, 0x49: 0,
    0x4a: 0, 0x4b: 2, 0x4c: 0, 0x4d: 2, 0x4e: 0, 0x4f: 0,
}
NAMES = {0x0d: 'switch', 0x0e: 'goto', 0x12: 'setmap', 0x13: 'loadmap', 0x19: 'moveto', 0x1d: 'say',
         0x1e: 'mode', 0x1f: 'face', 0x20: 'step', 0x21: 'flag+', 0x22: 'flag-', 0x23: 'objs', 0x24: 'rmobj',
         0x25: 'warp', 0x26: 'join', 0x28: 'op28'}


class Script:
    def __init__(self, rom):
        self.b = rom

    def u16(self, a): return struct.unpack('>H', self.b[a:a + 2])[0]
    def u32(self, a): return struct.unpack('>I', self.b[a:a + 4])[0]

    def group_block(self, g):
        return self.u32(0xE2DE2 + g * 4)

    def events(self, g):
        blk = self.group_block(g)
        n = self.u16(blk) // 2
        return {code: blk + self.u16(blk + code * 2) for code in range(n)}

    def decode(self, a, limit=400):
        """返回 [(地址, 指令号, 参数 bytes)]，遇到 FF FF 结束。"""
        out = []
        for _ in range(limit):
            op = self.u16(a)
            if op == 0xFFFF:
                out.append((a, 0xFFFF, b''))
                break
            start = a
            a += 2
            if op in ARGS:
                n = ARGS[op]
            elif op == 0x19:
                cnt = self.b[a + 1]
                n = 2 + 4 * cnt + (cnt + (cnt & 1))
            elif op == 0x1a:
                cnt = self.b[a + 1]
                n = 2 + 2 * cnt + (cnt + (cnt & 1))
            elif op == 0x23:
                p = a
                while self.u16(p) <= 0x0F:
                    p += 10
                n = p - a + 2
            elif op in (0x2e, 0x2f, 0x30, 0x35):
                n = 2 + 2 * self.u16(a)
            elif op == 0x0e:
                n = 4
            elif op == 0x0d:
                n = 0  # 后面是标签表，长度取决于运行时，照原样往下读
            else:
                out.append((start, op, b'?'))
                break
            out.append((start, op, self.b[a:a + n]))
            a += n
        return out


def fmt(op, args):
    name = NAMES.get(op, f'op{op:02x}')
    if op == 0xFFFF:
        return 'end'
    return f'{name:8s} ' + ' '.join(f'{args[i]:02x}{args[i + 1]:02x}' if i + 1 < len(args) else f'{args[i]:02x}' for i in range(0, len(args), 2))


if __name__ == '__main__':
    rom = open(sys.argv[1], 'rb').read()
    s = Script(rom)
    g = int(sys.argv[2], 0)
    ev = s.events(g)
    seen = set()
    for code, a in sorted(ev.items()):
        if a in seen:
            continue
        seen.add(a)
        codes = [c for c, x in ev.items() if x == a]
        print(f'== event {",".join(hex(c) for c in codes)} @ {a:#07x}')
        for addr, op, args in s.decode(a):
            print(f'   {addr:06x}  {fmt(op, args)}')
