# ROM 分析工具

这些脚本用来研究原版 ROM 的数据格式，结论记在 `docs/rom-notes.md`。ROM 本身和导出来的图都不进仓库（放在 `rom/`，已被 .gitignore 忽略）。

需要 Python 3、Pillow、capstone（`pip install pillow capstone`）。

## 静态分析（只读 ROM 文件）

| 脚本 | 用途 |
|---|---|
| `inspect_rom.py rom.md` | 头信息、校验和、CRC32 |
| `tiles.py` | 把一段 ROM 当 4bpp 图块画出来 |
| `m68k.py rom.md 0x2d80 40` | 反汇编一段 68000 代码 |
| `findseq.py` | 在 ROM 里找一串 16 位字（允许整体差一个常数，找版面数据用） |
| `mdmap.py` | 按原版结构直接从 ROM 画地图 |
| `msg.py rom.md 0 20 out.png` | 用 ROM 字库把第 0–19 条消息画成图，方便看剧情 |
| `script.py rom.md 1` | 反汇编第 1 组地图的全部事件脚本 |
| `unpack_upload.py` | 把游戏页面上传的 ROM 文本附件还原成 ROM 文件 |

## 在模拟器里跑（`emu.py`、`play.py`、`vram.py`）

用 Genesis Plus GX 的 libretro 核心，不开窗口，能按键、截图、导出显存、读写内存、存读档。

编译核心（导出显存等符号）：

```sh
git clone --depth 1 https://github.com/libretro/Genesis-Plus-GX gpgx
cd gpgx
# 导出 vram/cram/work_ram 等符号，Python 才能直接读
printf '{\n   global: retro_*; vram; cram; vsram; work_ram; reg; sat; m68k; bitmap; trace_*;\n   local: *;\n};\n' > libretro/link.T
make -f Makefile.libretro -j4
export GPGX_CORE=$PWD/genesis_plus_gx_libretro.so
```

想要追踪（哪条指令读了 ROM 的哪里、DMA 从哪里传图、执行到某个地址时的寄存器），用追踪版：

```sh
git apply /path/to/mmjw/tools/rom/gpgx/trace.patch      # 在干净的 gpgx 目录里
cp /path/to/mmjw/tools/rom/gpgx/tracer.c core/debug/
make -f Makefile.libretro HOOK_CPU=1 -j4
```

`trace.patch` 基于 Genesis-Plus-GX 的 `c2838c7`（它的许可证不允许商业使用，这里只用来做分析），改了三处：`cpuhook.h` 的声明加 `extern`（新版 GCC 默认 `-fno-common`），`vdp_ctrl.c` 里记录 DMA，`link.T` 导出符号。

用法示例：

```python
from emu import Emu
from play import walk, state
e = Emu('rom/game.md')            # 需要 GPGX_CORE 环境变量
e.run(600); e.tap('START', after=120)
e.shot('rom/shots/title.png')
e.save_state('rom/emu/title.state')

e.trace_reset(); e.watch(0xFD20); e.trace(True)   # 追踪版核心才有
e.tap('A', after=60)
for pc, d, a in e.hits():                          # 每条脚本指令的编号在 d1
    print(hex(d[1] & 0xffff), hex(a[3]))
print(e.rom_reads()[:10])                          # 读过的 ROM 区间和读它的指令
```

`play.walk(e, (列, 行))` 按属性层找路走过去，`play.talk_through(e)` 连按 A 推进对话。
