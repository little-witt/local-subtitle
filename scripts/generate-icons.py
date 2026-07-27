#!/usr/bin/env python3
"""Generate extension PNG icons without third-party dependencies."""

from __future__ import annotations

import os
import struct
import zlib


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ICON_DIR = os.path.join(ROOT, "icons")
SCALE = 4


def blend_pixel(buf: bytearray, width: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if x < 0 or y < 0 or x >= width or y >= width:
        return
    offset = (y * width + x) * 4
    sr, sg, sb, sa = color
    if sa == 255:
        buf[offset : offset + 4] = bytes(color)
        return
    da = buf[offset + 3]
    out_a = sa + da * (255 - sa) // 255
    if out_a == 0:
        return
    for channel, source in enumerate((sr, sg, sb)):
        dest = buf[offset + channel]
        buf[offset + channel] = (source * sa + dest * da * (255 - sa) // 255) // out_a
    buf[offset + 3] = out_a


def fill_rounded_rect(
    buf: bytearray,
    width: int,
    x: int,
    y: int,
    w: int,
    h: int,
    r: int,
    color: tuple[int, int, int, int],
) -> None:
    x2 = x + w - 1
    y2 = y + h - 1
    for py in range(y, y + h):
        for px in range(x, x + w):
            cx = min(max(px, x + r), x2 - r)
            cy = min(max(py, y + r), y2 - r)
            if (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r:
                blend_pixel(buf, width, px, py, color)


def fill_rect(
    buf: bytearray,
    width: int,
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int, int],
) -> None:
    for py in range(y, y + h):
        for px in range(x, x + w):
            blend_pixel(buf, width, px, py, color)


def fill_triangle(
    buf: bytearray,
    width: int,
    points: tuple[tuple[int, int], tuple[int, int], tuple[int, int]],
    color: tuple[int, int, int, int],
) -> None:
    (x1, y1), (x2, y2), (x3, y3) = points
    min_x = min(x1, x2, x3)
    max_x = max(x1, x2, x3)
    min_y = min(y1, y2, y3)
    max_y = max(y1, y2, y3)
    denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    for py in range(min_y, max_y + 1):
        for px in range(min_x, max_x + 1):
            a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom
            b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom
            c = 1 - a - b
            if a >= 0 and b >= 0 and c >= 0:
                blend_pixel(buf, width, px, py, color)


def png_chunk(kind: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(kind)
    crc = zlib.crc32(data, crc)
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc & 0xFFFFFFFF)


def write_png(path: str, size: int, rgba: bytes) -> None:
    rows = []
    stride = size * 4
    for y in range(size):
        rows.append(b"\x00" + rgba[y * stride : (y + 1) * stride])
    data = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(data, 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as file:
        file.write(png)


def downsample(buf: bytearray, canvas: int, size: int) -> bytes:
    step = canvas // size
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            totals = [0, 0, 0, 0]
            for sy in range(step):
                for sx in range(step):
                    offset = ((y * step + sy) * canvas + (x * step + sx)) * 4
                    for channel in range(4):
                        totals[channel] += buf[offset + channel]
            count = step * step
            offset = (y * size + x) * 4
            out[offset : offset + 4] = bytes(value // count for value in totals)
    return bytes(out)


def scaled(value: int) -> int:
    return value * SCALE


def create_icon(size: int) -> bytes:
    canvas = size * SCALE
    buf = bytearray(canvas * canvas * 4)

    teal = (20, 90, 83, 255)
    teal_dark = (13, 74, 69, 255)
    paper = (250, 250, 247, 255)
    red = (210, 56, 56, 255)
    gold = (244, 194, 82, 255)

    fill_rounded_rect(buf, canvas, 0, 0, canvas, canvas, scaled(max(3, size // 6)), teal)
    fill_rounded_rect(
        buf,
        canvas,
        scaled(size * 14 // 128),
        scaled(size * 22 // 128),
        scaled(size * 100 // 128),
        scaled(size * 70 // 128),
        scaled(size * 13 // 128),
        paper,
    )
    fill_triangle(
        buf,
        canvas,
        (
            (scaled(size * 42 // 128), scaled(size * 88 // 128)),
            (scaled(size * 60 // 128), scaled(size * 88 // 128)),
            (scaled(size * 46 // 128), scaled(size * 105 // 128)),
        ),
        paper,
    )
    fill_rounded_rect(
        buf,
        canvas,
        scaled(size * 30 // 128),
        scaled(size * 39 // 128),
        scaled(size * 50 // 128),
        scaled(max(3, size * 9 // 128)),
        scaled(max(2, size * 4 // 128)),
        teal_dark,
    )
    fill_rounded_rect(
        buf,
        canvas,
        scaled(size * 30 // 128),
        scaled(size * 58 // 128),
        scaled(size * 68 // 128),
        scaled(max(3, size * 9 // 128)),
        scaled(max(2, size * 4 // 128)),
        teal_dark,
    )
    fill_rounded_rect(
        buf,
        canvas,
        scaled(size * 30 // 128),
        scaled(size * 76 // 128),
        scaled(size * 42 // 128),
        scaled(max(3, size * 8 // 128)),
        scaled(max(2, size * 4 // 128)),
        red,
    )
    fill_rounded_rect(
        buf,
        canvas,
        scaled(size * 82 // 128),
        scaled(size * 74 // 128),
        scaled(size * 16 // 128),
        scaled(max(3, size * 8 // 128)),
        scaled(max(2, size * 4 // 128)),
        gold,
    )

    return downsample(buf, canvas, size)


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(os.path.join(ICON_DIR, f"icon{size}.png"), size, create_icon(size))


if __name__ == "__main__":
    main()
