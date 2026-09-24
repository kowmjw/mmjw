"""无界面跑 MD 游戏的小工具：用 Genesis Plus GX 的 libretro 核心，按键、截图、导出显存。

核心需要自己编译，并导出显存符号（见 tools/rom/README.md）。用法：

    from emu import Emu
    e = Emu('rom/game.md', core='/path/genesis_plus_gx_libretro.so')
    e.run(120); e.tap('start'); e.shot('shots/title.png')
"""
import ctypes as C
import os
import struct

# RetroPad 按键编号 → Genesis Plus GX 默认对应的 MD 按键
PAD = {'b': 0, 'y': 1, 'select': 2, 'start': 3, 'up': 4, 'down': 5, 'left': 6, 'right': 7, 'a': 8, 'x': 9, 'l': 10, 'r': 11}
# MD 的 A/B/C 在 GPGX 里分别是 RetroPad 的 Y/B/A
MD = {'A': 'y', 'B': 'b', 'C': 'a', 'START': 'start', 'UP': 'up', 'DOWN': 'down', 'LEFT': 'left', 'RIGHT': 'right'}

ENV_GET_OVERSCAN = 2
ENV_GET_CAN_DUPE = 3
ENV_SET_PIXEL_FORMAT = 10
ENV_GET_SYSTEM_DIRECTORY = 9
ENV_GET_VARIABLE = 15
ENV_GET_VARIABLE_UPDATE = 17
ENV_GET_SAVE_DIRECTORY = 31

ENV_CB = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
VIDEO_CB = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
AUDIO_CB = C.CFUNCTYPE(None, C.c_int16, C.c_int16)
AUDIO_BATCH_CB = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
POLL_CB = C.CFUNCTYPE(None)
STATE_CB = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)


class GameInfo(C.Structure):
    _fields_ = [('path', C.c_char_p), ('data', C.c_void_p), ('size', C.c_size_t), ('meta', C.c_char_p)]


class Variable(C.Structure):
    _fields_ = [('key', C.c_char_p), ('value', C.c_char_p)]


class Emu:
    def __init__(self, rom_path, core=None, workdir=None):
        core = core or os.environ.get('GPGX_CORE')
        if not core:
            raise SystemExit('需要 GPGX_CORE 环境变量指向 genesis_plus_gx_libretro.so')
        self.lib = C.CDLL(core)
        self.workdir = (workdir or os.path.join(os.path.dirname(os.path.abspath(rom_path)), 'emu')).encode()
        os.makedirs(self.workdir, exist_ok=True)
        self.frame = None
        self.size = (0, 0)
        self.held = set()
        self.frames = 0
        self._keep = []
        self._dir = C.c_char_p(self.workdir)

        def env(cmd, data):
            cmd &= 0xFFFF
            if cmd == ENV_SET_PIXEL_FORMAT:
                fmt = C.cast(data, C.POINTER(C.c_int)).contents.value
                return fmt == 2  # RGB565
            if cmd in (ENV_GET_SYSTEM_DIRECTORY, ENV_GET_SAVE_DIRECTORY):
                C.cast(data, C.POINTER(C.c_char_p))[0] = self.workdir
                return True
            if cmd == ENV_GET_VARIABLE:
                var = C.cast(data, C.POINTER(Variable)).contents
                val = self.options.get(var.key.decode()) if var.key else None
                if val is None:
                    return False
                buf = C.c_char_p(val.encode())
                self._keep.append(buf)
                var.value = buf.value
                return True
            if cmd == ENV_GET_VARIABLE_UPDATE:
                C.cast(data, C.POINTER(C.c_bool))[0] = False
                return True
            if cmd == ENV_GET_CAN_DUPE:
                C.cast(data, C.POINTER(C.c_bool))[0] = True
                return True
            return False

        def video(data, w, h, pitch):
            if data:
                self.size = (w, h)
                self.frame = C.string_at(data, pitch * h), pitch

        self.options = {'genesis_plus_gx_system_hw': 'mega drive / genesis', 'genesis_plus_gx_region_detect': 'ntsc-j',
                        'genesis_plus_gx_force_dtack': 'enabled', 'genesis_plus_gx_addr_error': 'disabled'}
        self._cbs = [ENV_CB(env), VIDEO_CB(video), AUDIO_CB(lambda l, r: None),
                     AUDIO_BATCH_CB(lambda d, n: n), POLL_CB(lambda: None),
                     STATE_CB(lambda port, dev, idx, id_: 1 if port == 0 and id_ in self.held else 0)]
        L = self.lib
        L.retro_set_environment(self._cbs[0])
        L.retro_set_video_refresh(self._cbs[1])
        L.retro_set_audio_sample(self._cbs[2])
        L.retro_set_audio_sample_batch(self._cbs[3])
        L.retro_set_input_poll(self._cbs[4])
        L.retro_set_input_state(self._cbs[5])
        L.retro_init()
        self.rom = open(rom_path, 'rb').read()
        self._rom_buf = C.create_string_buffer(self.rom, len(self.rom))
        info = GameInfo(os.path.abspath(rom_path).encode(), C.cast(self._rom_buf, C.c_void_p), len(self.rom), None)
        L.retro_load_game.restype = C.c_bool
        if not L.retro_load_game(C.byref(info)):
            raise SystemExit('核心读不了这个 ROM')
        L.retro_serialize_size.restype = C.c_size_t
        L.retro_serialize.restype = C.c_bool
        L.retro_unserialize.restype = C.c_bool
        self.vram = (C.c_uint8 * 0x10000).in_dll(L, 'vram')
        self.cram = (C.c_uint16 * 0x40).in_dll(L, 'cram')
        self.vsram = (C.c_uint8 * 0x80).in_dll(L, 'vsram')
        self.ram = (C.c_uint8 * 0x10000).in_dll(L, 'work_ram')
        self.reg = (C.c_uint8 * 0x20).in_dll(L, 'reg')
        # 追踪版核心（HOOK_CPU 编译，带 tracer.c）才有这些符号
        try:
            self.t_flags = (C.c_uint8 * 0x1000000).in_dll(L, 'trace_flags')
            self.t_reader = (C.c_uint32 * 0x400000).in_dll(L, 'trace_reader')
            self.t_ramwriter = (C.c_uint32 * 0x10000).in_dll(L, 'trace_ramwriter')
            self.t_vramwriter = (C.c_uint32 * 0x10000).in_dll(L, 'trace_vramwriter')
            self.t_enabled = C.c_int.in_dll(L, 'trace_enabled')
            self.t_dma = (C.c_uint32 * (4096 * 5)).in_dll(L, 'trace_dma')
            self.t_dma_count = C.c_uint32.in_dll(L, 'trace_dma_count')
            self.t_watch = (C.c_uint32 * 16).in_dll(L, 'trace_watch')
            self.t_watch_n = C.c_uint32.in_dll(L, 'trace_watch_n')
            self.t_hits = (C.c_uint32 * (8192 * 17)).in_dll(L, 'trace_hits')
            self.t_hit_count = C.c_uint32.in_dll(L, 'trace_hit_count')
            L.trace_install()
        except ValueError:
            self.t_flags = None

    # ---- 运行和按键 ----
    def run(self, frames=1):
        for _ in range(frames):
            self.lib.retro_run()
            self.frames += 1

    def hold(self, *keys):
        self.held = {PAD[MD.get(k.upper(), k.lower())] for k in keys}

    def tap(self, *keys, frames=4, after=10):
        self.hold(*keys)
        self.run(frames)
        self.held = set()
        self.run(after)

    # ---- 追踪 ----
    def trace_reset(self):
        for arr in (self.t_flags, self.t_reader, self.t_ramwriter, self.t_vramwriter):
            C.memset(arr, 0, C.sizeof(arr))

    def watch(self, *pcs):
        """执行到这些地址时记录寄存器（最多 16 个）。"""
        for i, pc in enumerate(pcs[:16]):
            self.t_watch[i] = pc
        self.t_watch_n.value = len(pcs[:16])
        self.t_hit_count.value = 0

    def hits(self):
        """[(pc, [d0..d7], [a0..a7])]"""
        n = min(self.t_hit_count.value, 8192)
        h = self.t_hits
        out = []
        for i in range(n):
            row = [h[i * 17 + k] for k in range(17)]
            out.append((row[0], row[1:9], row[9:17]))
        return out

    def dma_reset(self):
        self.t_dma_count.value = 0

    def dma_log(self):
        """[(源地址, 字数, 目标地址, 目标类型 1=VRAM 3=CRAM 5=VSRAM, 发起 DMA 时的 PC)]"""
        n = min(self.t_dma_count.value, 4096)
        d = self.t_dma
        return [tuple(d[i * 5 + k] for k in range(5)) for i in range(n)]

    def trace(self, on=True):
        if self.t_flags is None:
            raise SystemExit('需要追踪版核心')
        self.t_enabled.value = 1 if on else 0

    def rom_reads(self, limit=0x400000):
        """ROM 里被当数据读过的区间：[(起点, 终点, {读它的 PC})]"""
        flags = bytes(self.t_flags)[:limit]
        reader = self.t_reader
        out = []
        i = 0
        n = min(limit, len(self.rom))
        while i < n:
            if flags[i] & 1:
                j = i
                pcs = set()
                while j < n and flags[j] & 1:
                    pcs.add(reader[j])
                    j += 1
                out.append((i, j, pcs))
                i = j
            else:
                i += 1
        return out

    def executed(self):
        flags = bytes(self.t_flags)
        return [i for i in range(0, min(len(self.rom), 0x400000), 2) if flags[i] & 2]

    # ---- 存档点 ----
    def save_state(self, path):
        n = self.lib.retro_serialize_size()
        buf = C.create_string_buffer(n)
        assert self.lib.retro_serialize(buf, n)
        open(path, 'wb').write(buf.raw)

    def load_state(self, path):
        data = open(path, 'rb').read()
        buf = C.create_string_buffer(data, len(data))
        assert self.lib.retro_unserialize(buf, len(data))

    # ---- 画面 ----
    def image(self):
        from PIL import Image
        raw, pitch = self.frame
        w, h = self.size
        img = Image.new('RGB', (w, h))
        px = img.load()
        for y in range(h):
            row = raw[y * pitch:(y * pitch) + w * 2]
            for x in range(w):
                v = row[x * 2] | (row[x * 2 + 1] << 8)
                px[x, y] = (((v >> 11) & 31) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31)
        return img

    def shot(self, path, scale=2):
        from PIL import Image
        img = self.image()
        if scale != 1:
            img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        img.save(path)
        return path

    # ---- 显存 ----
    def palette(self):
        """CRAM 的 64 个颜色，转成 RGB。GPGX 内部把颜色存成 9 位 BBBGGGRRR。"""
        out = []
        for i in range(64):
            v = self.cram[i]
            r, g, b = v & 7, (v >> 3) & 7, (v >> 6) & 7
            out.append((r * 255 // 7, g * 255 // 7, b * 255 // 7))
        return out

    def vram_bytes(self):
        """按 MD 的字节顺序返回 64KB 显存（GPGX 在小端机器上按 16 位字交换存放）。"""
        raw = bytes(self.vram)
        out = bytearray(0x10000)
        out[0::2] = raw[1::2]
        out[1::2] = raw[0::2]
        return bytes(out)

    def ram_bytes(self):
        raw = bytes(self.ram)
        out = bytearray(0x10000)
        out[0::2] = raw[1::2]
        out[1::2] = raw[0::2]
        return bytes(out)

    def ram_write(self, addr, data):
        """按 68000 地址写 RAM（核心里按 16 位字交换存放）。"""
        for i, v in enumerate(data):
            a = (addr + i) & 0xFFFF
            self.ram[a ^ 1] = v

    def vdp_regs(self):
        return list(self.reg)

    def plane_info(self):
        r = self.reg
        size_code = r[16]
        dims = {0: 32, 1: 64, 3: 128}
        return {
            'plane_a': (r[2] & 0x38) << 10,
            'window': (r[3] & 0x3E) << 10,
            'plane_b': (r[4] & 0x07) << 13,
            'sprites': (r[5] & 0x7F) << 9,
            'hscroll': (r[13] & 0x3F) << 10,
            'width': dims.get(size_code & 3, 32),
            'height': dims.get((size_code >> 4) & 3, 32),
        }
