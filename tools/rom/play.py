"""在模拟器里自动走路、推进对话的小工具。"""
import struct
from collections import deque

DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}


def state(e):
    r = e.ram_bytes()
    return {
        'map': struct.unpack('>H', r[0xE100:0xE102])[0],
        'x': struct.unpack('>H', r[0xE002:0xE004])[0],
        'y': struct.unpack('>H', r[0xE004:0xE006])[0],
        'w': r[0xE108], 'h': r[0xE107],
        'busy': r[0x603D],
    }


def attr_grid(e):
    r = e.ram_bytes()
    w = r[0xE108]
    h = r[0xE107]
    return w, h, r[0xD000:0xD000 + w * h]


def npc_cells(e):
    r = e.ram_bytes()
    cells = set()
    for slot in range(1, 16):
        a = 0xE000 + slot * 16
        if r[a] == 0:
            continue
        x, y = struct.unpack('>HH', r[a + 2:a + 6])
        cells.add((x // 32, y // 32))
    return cells


def path(e, goal, allow_goal_blocked=False):
    s = state(e)
    w, h, at = attr_grid(e)
    start = (s['x'] // 32, s['y'] // 32)
    blocked = npc_cells(e)
    q = deque([start]); prev = {start: None}
    while q:
        c = q.popleft()
        if c == goal:
            break
        for d, (dx, dy) in DIRS.items():
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[0] < w and 0 <= n[1] < h) or n in prev:
                continue
            v = at[n[1] * w + n[0]]
            ok = v <= 0x4F and n not in blocked
            if n == goal and allow_goal_blocked:
                ok = True
            if ok:
                prev[n] = (c, d); q.append(n)
    if goal not in prev:
        return None
    steps = []
    c = goal
    while prev[c]:
        c, d = prev[c]
        steps.append(d)
    return steps[::-1]


def walk(e, goal, allow_goal_blocked=False, max_tries=6):
    for _ in range(max_tries):
        s = state(e)
        if (s['x'] // 32, s['y'] // 32) == goal:
            return True
        p = path(e, goal, allow_goal_blocked)
        if not p:
            return False
        for d in p:
            before = state(e)
            e.tap(d, frames=3, after=17)
            after = state(e)
            if after['map'] != before['map']:
                return True
            if (after['x'], after['y']) == (before['x'], before['y']):
                break  # 被挡住了，重新找路
    s = state(e)
    return (s['x'] // 32, s['y'] // 32) == goal


def talk_through(e, presses=20, gap=40):
    for _ in range(presses):
        e.tap('A', frames=4, after=gap)
