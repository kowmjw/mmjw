/* 调试用：记录 68000 读 ROM、写 RAM、写显存时的 PC，给 Python 分析工具读取。 */
#ifdef HOOK_CPU
#include "shared.h"
#include "cpuhook.h"

unsigned char trace_flags[0x1000000];      /* 1=数据读 2=执行 4=写 */
unsigned int trace_reader[0x400000];       /* ROM 每个字节最后一次被哪条指令读 */
unsigned int trace_ramwriter[0x10000];     /* RAM 每个字节最后一次被哪条指令写 */
unsigned int trace_vramwriter[0x10000];    /* 显存每个字节最后一次被哪条指令写 */
unsigned int trace_last_pc;
int trace_enabled;
unsigned int trace_dma[4096][5];
unsigned int trace_dma_count;

/* 断点记录：执行到 trace_watch 里的地址时，记下 PC 和 16 个寄存器 */
unsigned int trace_watch[16];
unsigned int trace_watch_n;
unsigned int trace_hits[8192][17];
unsigned int trace_hit_count;

static void hook(hook_type_t type, int width, unsigned int address, unsigned int value)
{
  int i;
  if (!trace_enabled) return;
  switch (type)
  {
    case HOOK_M68K_E:
      address &= 0xFFFFFF;
      trace_last_pc = address;
      trace_flags[address] |= 2;
      for (i = 0; i < (int)trace_watch_n; i++)
      {
        if (trace_watch[i] == address)
        {
          unsigned int *h = trace_hits[trace_hit_count & 8191];
          int r;
          h[0] = address;
          for (r = 0; r < 16; r++) h[1 + r] = m68k_get_reg((m68k_register_t)(M68K_REG_D0 + r));
          trace_hit_count++;
          break;
        }
      }
      break;
    case HOOK_M68K_R:
      for (i = 0; i < width; i++)
      {
        unsigned int a = (address + i) & 0xFFFFFF;
        trace_flags[a] |= 1;
        if (a < 0x400000) trace_reader[a] = trace_last_pc;
      }
      break;
    case HOOK_M68K_W:
      for (i = 0; i < width; i++)
      {
        unsigned int a = (address + i) & 0xFFFFFF;
        trace_flags[a] |= 4;
        if (a >= 0xFF0000) trace_ramwriter[a & 0xFFFF] = trace_last_pc;
      }
      break;
    case HOOK_VRAM_W:
      trace_vramwriter[address & 0xFFFF] = trace_last_pc;
      trace_vramwriter[(address + 1) & 0xFFFF] = trace_last_pc;
      break;
    default:
      break;
  }
}

void trace_install(void) { set_cpu_hook(hook); }
#endif
