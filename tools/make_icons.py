#!/usr/bin/env python3
"""Generate Tandem's app icons (pure stdlib — no Pillow needed).

Design: indigo→cyan gradient tile with two interlocked "tandem wheels".
Usage:  python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")

GRAD_A = (99, 102, 241)   # indigo
GRAD_B = (6, 182, 212)    # cyan
RING = (255, 255, 255)


def write_png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y]) for y in range(size))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"  {os.path.relpath(path)}  {size}x{size}")


def render(size, rounded=True, pad_scale=1.0, ss=3):
    """rounded: transparent rounded-rect tile; otherwise full-bleed square."""
    n = size * ss
    radius = n * 0.225 if rounded else 0
    # rings: two overlapping wheels, slightly left/right of center
    ring_r = n * 0.205 * pad_scale
    ring_w = n * 0.075 * pad_scale
    cy = n * 0.52
    cx1, cx2 = n * 0.38, n * 0.62

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    px, py = x * ss + sx + 0.5, y * ss + sy + 0.5
                    # rounded-rect coverage
                    if rounded:
                        ix = min(px, n - px)
                        iy = min(py, n - py)
                        if ix < radius and iy < radius:
                            if (radius - ix) ** 2 + (radius - iy) ** 2 > radius * radius:
                                continue
                    t = (px + py) / (2 * n)
                    cr = GRAD_A[0] + (GRAD_B[0] - GRAD_A[0]) * t
                    cg = GRAD_A[1] + (GRAD_B[1] - GRAD_A[1]) * t
                    cb = GRAD_A[2] + (GRAD_B[2] - GRAD_A[2]) * t
                    # wheels
                    for cx in (cx1, cx2):
                        d = math.hypot(px - cx, py - cy)
                        edge = ring_w / 2 - abs(d - ring_r)
                        if edge > 0:
                            k = min(1.0, edge / (ss * 0.7)) * 0.96
                            cr = cr + (RING[0] - cr) * k
                            cg = cg + (RING[1] - cg) * k
                            cb = cb + (RING[2] - cb) * k
                    r += cr; g += cg; b += cb; a += 255.0
            s = ss * ss
            row += bytes((int(r / s), int(g / s), int(b / s), int(a / s)))
        rows.append(row)
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Rendering icons…")
    write_png(os.path.join(OUT, "icon-192.png"), 192, render(192, rounded=True))
    write_png(os.path.join(OUT, "icon-512.png"), 512, render(512, rounded=True))
    # maskable: full-bleed, content shrunk into the 80% safe zone
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512, render(512, rounded=False, pad_scale=0.8))
    # iOS rounds it itself — must be opaque full-bleed
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180, render(180, rounded=False))
    print("Done.")


if __name__ == "__main__":
    main()
