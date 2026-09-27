"""Generates the app icons (plain PNG, no dependencies): blue background, white speech bubble."""
import struct, zlib, pathlib

BG = (31, 78, 140)
FG = (255, 255, 255)

def render(size: int) -> bytes:
    cx, cy, r = size * 0.5, size * 0.46, size * 0.30
    tail = [(size * 0.36, size * 0.66), (size * 0.30, size * 0.82), (size * 0.52, size * 0.72)]

    def in_tail(x, y):
        (x1, y1), (x2, y2), (x3, y3) = tail
        d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d
        b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
        return a >= 0 and b >= 0 and a + b <= 1

    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            inside = (x - cx) ** 2 + ((y - cy) * 1.15) ** 2 <= r * r or in_tail(x, y)
            rows.extend(FG if inside else BG)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9))
            + chunk(b'IEND', b''))

out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    (out / name).write_bytes(render(size))
    print('wrote', out / name)
