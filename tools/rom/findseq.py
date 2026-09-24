"""在 ROM 里找一串 16 位字（允许整体加减一个常数，比如图块起始编号或调色板位不同）。"""
import struct


def word_diffs(rom, align):
    n = (len(rom) - align) // 2
    words = struct.unpack(f'>{n}H', rom[align:align + n * 2])
    diffs = bytearray()
    for i in range(n - 1):
        diffs += struct.pack('>H', (words[i + 1] - words[i]) & 0xFFFF)
    return words, bytes(diffs)


_cache = {}


def find_words(rom, seq, max_hits=10):
    """返回 [(rom 偏移, 常数差 k)]，满足 rom 里的字 = seq[i] - k。"""
    if len(seq) < 3:
        raise ValueError('序列太短')
    pat = b''.join(struct.pack('>H', (seq[i + 1] - seq[i]) & 0xFFFF) for i in range(len(seq) - 1))
    hits = []
    for align in (0, 1):
        key = (id(rom), align)
        if key not in _cache:
            _cache[key] = word_diffs(rom, align)
        words, diffs = _cache[key]
        start = 0
        while len(hits) < max_hits:
            p = diffs.find(pat, start)
            if p < 0:
                break
            if p % 2 == 0:
                idx = p // 2
                hits.append((align + idx * 2, (seq[0] - words[idx]) & 0xFFFF))
            start = p + 1
    return hits
