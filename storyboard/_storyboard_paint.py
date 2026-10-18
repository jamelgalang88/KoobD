# Illustrated scenery for the colour storyboard.
#
# The frames are drawn as illustrations of the script, not as screenshots of
# the game: every location, ground and prop the frames name (`stage`, `gprop`,
# `block`, `gflower`, ...) is painted here in a soft, detailed picture-book
# style - layered depth, haze, light and texture - while keeping the place,
# the layout and the colours the script and the story's character art give.
#
# Coordinates are frame pixels (1600 x 900, ground line at 720). A shot is
# `zoom` times closer about the point `fx` on the ground line; far layers move
# less than near ones (`depth` 0 = the sky, 1 = the ground the characters
# stand on), so a close-up keeps its distance behind it.
import math
import os
import random
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from _storyboard_kit import GROUND_Y, H, S, STORY, W, mix, shade


def rgba(c, a=255):
    return tuple(int(v) for v in c[:3]) + (int(a),)


# --- Camera and pens ----------------------------------------------------------------

class Cam:
    def __init__(self, zoom=1.0, fx=W / 2):
        self.zoom, self.fx = zoom, fx

    def z(self, depth):
        return 1 + (self.zoom - 1) * depth

    def x(self, x, depth=1.0):
        return self.fx + (x - self.fx) * self.z(depth)

    def y(self, y, depth=1.0):
        return GROUND_Y + (y - GROUND_Y) * self.z(depth)

    def span(self, depth=1.0, pad=200):
        """World x range visible in a layer at this depth (plus a margin)."""
        z = self.z(depth)
        return self.fx - self.fx / z - pad, self.fx + (W - self.fx) / z + pad


class _Blend:
    """An ImageDraw stand-in that blends translucent shapes over the image."""

    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img, 'RGBA')

    def _go(self, method, box, *args, **kw):
        fill = kw.get('fill')
        if fill is None or len(fill) < 4 or fill[3] >= 255:
            getattr(self.d, method)(*args, **kw)
            return
        x0, y0, x1, y1 = [int(v) for v in box]
        pad = int(kw.get('width', 0) or 0) + 2
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(self.img.width, x1 + pad + 1), min(self.img.height, y1 + pad + 1)
        if x1 <= x0 or y1 <= y0:
            return
        tmp = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        td = ImageDraw.Draw(tmp)
        shift = lambda pts: [(x - x0, y - y0) for x, y in pts]
        a = args[0]
        if method in ('polygon', 'line'):
            a = shift(a)
        else:
            a = [a[0] - x0, a[1] - y0, a[2] - x0, a[3] - y0]
        getattr(td, method)(a, *args[1:], **kw)
        self.img.alpha_composite(tmp, (x0, y0))

    @staticmethod
    def _bbox(points):
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        return min(xs), min(ys), max(xs), max(ys)

    def polygon(self, pts, **kw):
        self._go('polygon', self._bbox(pts), pts, **kw)

    def line(self, pts, **kw):
        self._go('line', self._bbox(pts), pts, **kw)

    def ellipse(self, box, **kw):
        self._go('ellipse', box, box, **kw)

    def rectangle(self, box, **kw):
        self._go('rectangle', box, box, **kw)

    def rounded_rectangle(self, box, **kw):
        self._go('rounded_rectangle', box, box, **kw)

    def arc(self, box, a0, a1, **kw):
        self._go('arc', box, box, a0, a1, **kw)


class Pen:
    """Draws in world coordinates through the camera, at one depth."""

    def __init__(self, img, cam, depth=1.0):
        self.img, self.cam, self.k = img, cam, depth
        self.d = _Blend(img)

    @property
    def zz(self):
        return self.cam.z(self.k)

    def p(self, x, y):
        return (self.cam.x(x, self.k) * S, self.cam.y(y, self.k) * S)

    def poly(self, points, fill):
        self.d.polygon([self.p(x, y) for x, y in points], fill=rgba(fill) if len(fill) == 3 else fill)

    def ellipse(self, cx, cy, rx, ry, fill):
        x, y = self.p(cx, cy)
        a, b = rx * self.zz * S, ry * self.zz * S
        self.d.ellipse([x - a, y - b, x + a, y + b], fill=rgba(fill) if len(fill) == 3 else fill)

    def rect(self, x0, y0, x1, y1, fill, r=0):
        (a, b), (c, d) = self.p(x0, y0), self.p(x1, y1)
        if c < a or d < b:
            return
        fill = rgba(fill) if len(fill) == 3 else fill
        if r:
            self.d.rounded_rectangle([a, b, c, d], radius=r * self.zz * S, fill=fill)
        else:
            self.d.rectangle([a, b, c, d], fill=fill)

    def line(self, points, fill, width):
        self.d.line([self.p(x, y) for x, y in points], fill=rgba(fill) if len(fill) == 3 else fill,
                    width=max(1, int(width * self.zz * S)), joint='curve')

    def arc(self, cx, cy, rx, ry, a0, a1, fill, width):
        x, y = self.p(cx, cy)
        a, b = rx * self.zz * S, ry * self.zz * S
        self.d.arc([x - a, y - b, x + a, y + b], a0, a1, fill=rgba(fill) if len(fill) == 3 else fill,
                   width=max(1, int(width * self.zz * S)))


def new_layer():
    return Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))


def soft(img, layer, blur=0, opacity=1.0):
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur * S))
    if opacity < 1:
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * opacity)))
    img.alpha_composite(layer)


def sky(img, top, bottom, y1=GROUND_Y):
    d = ImageDraw.Draw(img)
    for y in range(H * S):
        t = min(1.0, y / (y1 * S))
        d.line([(0, y), (W * S, y)], fill=rgba(mix(top, bottom, t ** 0.9)))


def sun_glow(img, x, y, r, color, opacity=0.7):
    lay = new_layer()
    d = ImageDraw.Draw(lay)
    for k in range(6, 0, -1):
        rr = r * k / 6
        d.ellipse([(x - rr) * S, (y - rr) * S, (x + rr) * S, (y + rr) * S], fill=rgba(color, 255 * (1 - k / 7) * 0.5))
    soft(img, lay, blur=r * 0.25, opacity=opacity)


# --- Nature pieces ------------------------------------------------------------------

def cloud(pen, cx, cy, w, color=(255, 255, 255), shadow=(206, 218, 236), seed=1):
    rnd = random.Random(seed)
    puffs = [(cx + rnd.uniform(-0.42, 0.42) * w, cy - rnd.uniform(0, 0.22) * w, rnd.uniform(0.14, 0.24) * w) for _ in range(7)]
    puffs.append((cx, cy - 0.1 * w, 0.26 * w))
    for x, y, r in puffs:
        pen.ellipse(x, y + r * 0.18, r, r * 0.8, shadow)
    for x, y, r in puffs:
        pen.ellipse(x - r * 0.08, y, r * 0.94, r * 0.72, color)
    for x, y, r in puffs[:4]:
        pen.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.28, shade(color, 1.4) if color != (255, 255, 255) else (255, 255, 255))
    pen.rect(cx - w * 0.5, cy, cx + w * 0.5, cy + w * 0.07, shadow, r=w * 0.035)


def hill_band(pen, y, amp, color, seed=1, freq=1.0, x0=-400, x1=W + 400, bottom=None):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.3) for _ in range(3)]
    pts = [(x0, bottom if bottom is not None else H + 900)]
    for x in range(int(x0), int(x1) + 21, 20):
        h = sum(math.sin(x / (300 / freq) * (k + 1) * 0.55 + ph[k]) / (k + 1) for k in range(3))
        pts.append((x, y - h * amp))
    pts.append((x1, bottom if bottom is not None else H + 900))
    pen.poly(pts, color)
    return pts


def leaf_mass(pen, cx, cy, r, base, seed=1, n=11, light=None, specks=True, squash=0.82):
    """A clustered crown of leaves: shadowed underside, mid tones, lit tops."""
    rnd = random.Random(seed)
    dark, lit = shade(base, 0.68), light or shade(base, 1.28)
    blobs = []
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0, 0.62) * r
        blobs.append((cx + math.cos(a) * d, cy + math.sin(a) * d * squash, rnd.uniform(0.32, 0.5) * r))
    for x, y, br in blobs:
        pen.ellipse(x, y + br * 0.15, br * 1.02, br * 0.86, dark)
    for x, y, br in blobs:
        pen.ellipse(x - br * 0.06, y - br * 0.04, br * 0.9, br * 0.74, base)
    for x, y, br in sorted(blobs, key=lambda b: b[1])[:max(3, n // 2)]:
        pen.ellipse(x - br * 0.22, y - br * 0.3, br * 0.48, br * 0.32, lit)
    if specks:
        for _ in range(int(n * 2.2)):
            x, y = cx + rnd.uniform(-0.85, 0.85) * r, cy + rnd.uniform(-0.7, 0.55) * r * squash
            s = rnd.uniform(0.025, 0.05) * r
            pen.ellipse(x, y, s, s * 0.7, shade(lit, 1.12) if rnd.random() < 0.6 else dark)


def trunk(pen, x, base, top, w, bark, seed=1, roots=True, lean=0.0, taper=0.72):
    rnd = random.Random(seed)
    dark, lit = shade(bark, 0.7), shade(bark, 1.22)
    flare = w * (1.8 if roots else 1.05)
    tw = w * taper
    pen.poly([(x - flare / 2, base), (x - w / 2, base - (base - top) * 0.16), (x - tw / 2 + lean, top),
              (x + tw / 2 + lean, top), (x + w / 2, base - (base - top) * 0.16), (x + flare / 2, base)], bark)
    pen.poly([(x + w * 0.12 + lean * 0.5, top), (x + tw / 2 + lean, top), (x + w / 2, base - (base - top) * 0.16),
              (x + flare / 2, base), (x + w * 0.18, base)], dark)
    pen.poly([(x - w * 0.38, base - (base - top) * 0.1), (x - tw * 0.36 + lean, top), (x - tw * 0.2 + lean, top),
              (x - w * 0.22, base - (base - top) * 0.1)], lit)
    h = base - top
    for _ in range(int(h / 26)):
        yy = rnd.uniform(top, base - 8)
        xx = x + rnd.uniform(-0.3, 0.25) * w + lean * (base - yy) / max(1, h)
        pen.line([(xx, yy), (xx + rnd.uniform(-3, 3), yy + rnd.uniform(10, 26))], dark, max(1.2, w * 0.03))
    if roots:
        for side in (-1, 1):
            pen.poly([(x + side * w * 0.3, base - h * 0.06), (x + side * flare * 0.62, base + 4), (x + side * w * 0.2, base + 4)], dark if side > 0 else bark)


def broadleaf(pen, x, base, h, leaf=(70, 136, 66), bark=(116, 82, 54), seed=1, canopy=0.5, roots=True):
    """A full tree: trunk, a couple of branches, a big clustered crown."""
    rnd = random.Random(seed)
    w = h * 0.11
    crown_y = base - h * 0.68
    trunk(pen, x, base, crown_y, w, bark, seed, roots)
    for side in (-1, 1):
        bx = x + side * w * 0.2
        pen.line([(bx, crown_y + h * 0.16), (bx + side * h * 0.16, crown_y - h * 0.02)], shade(bark, 0.9), w * 0.28)
    r = h * canopy * 0.5
    for k, (ox, oy, s) in enumerate(((-0.55, 0.12, 0.72), (0.58, 0.1, 0.7), (0.0, -0.18, 0.92), (0.0, 0.18, 0.75))):
        leaf_mass(pen, x + ox * r, crown_y + oy * r, r * s, shade(leaf, 0.92 + 0.06 * k), seed=seed * 7 + k, n=10)


def birch(pen, x, base, top, w, seed=1, foliage=(178, 218, 214), bark=(238, 240, 240)):
    rnd = random.Random(seed)
    pen.rect(x - w / 2, top, x + w / 2, base, bark)
    pen.rect(x + w * 0.18, top, x + w / 2, base, shade(bark, 0.86))
    for _ in range(int((base - top) / 70)):
        yy = rnd.uniform(top, base)
        ww = rnd.uniform(0.25, 0.55) * w
        xx = x + rnd.choice([-1, 1]) * w * 0.3
        pen.rect(xx - ww / 2, yy, xx + ww / 2, yy + rnd.uniform(2, 4), (70, 76, 84), r=2)
        pen.line([(xx - ww * 0.3, yy + 2), (xx - ww * 0.5, yy + 9)], (110, 116, 122), 1.2)
    if foliage:
        for k in range(3):
            leaf_mass(pen, x + rnd.uniform(-1, 1) * w * 1.6, top + k * w * 2.2, w * rnd.uniform(1.6, 2.4), foliage, seed=seed + k, n=8)


def pine(pen, x, base, h, color=(52, 104, 84), snow=False):
    w = h * 0.46
    pen.rect(x - w * 0.05, base - h * 0.14, x + w * 0.05, base, (96, 70, 52))
    for k in range(4):
        y = base - h * 0.1 - k * h * 0.2
        ww = w * (1 - k * 0.2)
        pen.poly([(x - ww / 2, y), (x, y - h * 0.36), (x + ww / 2, y)], color)
        pen.poly([(x, y - h * 0.36), (x + ww / 2, y), (x + ww * 0.06, y)], shade(color, 0.74))
        if snow:
            pen.poly([(x - ww * 0.2, y - h * 0.26), (x, y - h * 0.36), (x + ww * 0.2, y - h * 0.26)], (236, 242, 250))


def tufts(pen, x0, x1, y0, y1, n, colors, seed=5, size=(10, 26), lean=0.0):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        near = (y - y0) / max(1, y1 - y0)
        L = rnd.uniform(*size) * (0.55 + 0.9 * near)
        c = rnd.choice(colors)
        for b in range(rnd.randint(3, 6)):
            a = -math.pi / 2 + rnd.uniform(-0.55, 0.55) + lean
            bend = rnd.uniform(-0.35, 0.35)
            px, py = x + rnd.uniform(-3, 3), y
            pts = [(px, py)]
            for i in range(1, 4):
                t = i / 3
                pts.append((px + math.cos(a + bend * t) * L * t, py + math.sin(a + bend * t) * L * t))
            pen.line(pts, c, max(1.0, L * 0.09))


def blossoms(pen, x0, x1, y0, y1, n, seed=7, size=5, colors=((240, 96, 90), (246, 160, 205), (252, 214, 92), (255, 255, 255), (176, 140, 228))):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        s = size * (0.6 + 0.9 * (y - y0) / max(1, y1 - y0))
        pen.line([(x, y), (x, y + s * 2.2)], (70, 130, 60), s * 0.3)
        c = rnd.choice(colors)
        for k in range(5):
            a = k * 2 * math.pi / 5
            pen.ellipse(x + math.cos(a) * s * 0.62, y + math.sin(a) * s * 0.62, s * 0.5, s * 0.5, c)
        pen.ellipse(x, y, s * 0.32, s * 0.32, (255, 214, 110))


def pebbles(pen, x0, x1, y0, y1, n, color, seed=4, size=(3, 9)):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        s = rnd.uniform(*size) * (0.6 + 0.9 * (y - y0) / max(1, y1 - y0))
        pen.ellipse(x, y + s * 0.25, s, s * 0.55, shade(color, 0.7))
        pen.ellipse(x - s * 0.1, y, s * 0.9, s * 0.5, color)
        pen.ellipse(x - s * 0.35, y - s * 0.15, s * 0.35, s * 0.18, shade(color, 1.25))


def peak(pen, cx, base, top, half, rock, snow=True, seed=1, snow_line=0.3):
    rnd = random.Random(seed)
    lit, dark = shade(rock, 1.12), shade(rock, 0.72)
    left = [(cx - half, base)]
    n = 7
    for i in range(1, n):
        t = i / n
        left.append((cx - half * (1 - t) + rnd.uniform(-10, 10) * half / 300, base - (base - top) * t + rnd.uniform(-14, 14) * half / 300))
    right = []
    for i in range(n - 1, 0, -1):
        t = i / n
        right.append((cx + half * (1 - t) + rnd.uniform(-10, 10) * half / 300, base - (base - top) * t + rnd.uniform(-14, 14) * half / 300))
    pts = left + [(cx, top)] + right + [(cx + half, base)]
    pen.poly(pts, rock)
    # the shadowed face, split down a ridge from the summit
    pen.poly([(cx, top)] + right + [(cx + half, base), (cx + half * 0.15, base)], dark)
    pen.poly([(cx, top), (cx - half * 0.35, base), (cx - half * 0.55, base)] + list(reversed(left[2:4])), lit)
    for k in range(3):
        sx = cx + rnd.uniform(-0.6, 0.5) * half
        pen.line([(cx + (sx - cx) * 0.2, top + (base - top) * 0.2), (sx, base - (base - top) * rnd.uniform(0.05, 0.3))], shade(rock, 0.8), half * 0.012)
    if snow:
        sl = top + (base - top) * snow_line
        k = half * snow_line
        cap = [(cx - k, sl)]
        for i in range(1, 6):
            t = i / 6
            cap.append((cx - k + 2 * k * t, sl + (rnd.uniform(-0.3, 0.6) if i % 2 else -0.4) * (base - top) * 0.08))
        cap += [(cx + k, sl), (cx, top)]
        pen.poly(cap, (240, 245, 252))
        pen.poly([(cx, top), (cx + k, sl), (cx + k * 0.4, sl + (base - top) * 0.04), (cx + k * 0.1, sl - (base - top) * 0.05)], (200, 214, 236))


def stone_blocks(pen, x0, y0, x1, y1, base, bw=64, bh=30, seed=2, mortar=None, moss=None):
    rnd = random.Random(seed)
    pen.rect(x0, y0, x1, y1, mortar or shade(base, 0.7))
    row, y = 0, y0
    while y < y1:
        x = x0 - (bw / 2) * (row % 2)
        while x < x1:
            c = shade(base, rnd.uniform(0.88, 1.1))
            a, b = max(x0, x + 2.5), min(x1, x + bw - 2.5)
            if b > a:
                pen.rect(a, y + 2.5, b, min(y1, y + bh - 2.5), c, r=3)
                pen.rect(a, y + 2.5, b, min(y1, y + 7), shade(c, 1.1), r=2)
            x += bw
        y += bh
        row += 1
    if moss:
        for _ in range(int((x1 - x0) / 90)):
            mx = rnd.uniform(x0, x1)
            my = rnd.choice([y0 + rnd.uniform(0, 30), y1 - rnd.uniform(0, 40)])
            leaf_mass(pen, mx, my, rnd.uniform(14, 30), moss, seed=int(mx), n=5, specks=False)


def crenels(pen, x0, x1, y, h, w, gap, color):
    x = x0
    while x < x1:
        pen.rect(x, y - h, min(x1, x + w), y + 2, color)
        pen.rect(x, y - h, min(x1, x + w), y - h + 6, shade(color, 1.12))
        pen.rect(x + w * 0.72, y - h, min(x1, x + w), y + 2, shade(color, 0.84))
        x += w + gap


def round_tower(pen, x, base, top, w, stone=(164, 160, 172), roof=(74, 98, 160), flag=(196, 52, 58), seed=1):
    stone_blocks(pen, x - w / 2, top, x + w / 2, base, stone, bw=w / 4, bh=w / 7, seed=seed)
    pen.rect(x + w * 0.2, top, x + w / 2, base, rgba(shade(stone, 0.6), 90))
    pen.rect(x - w / 2, top, x - w * 0.36, base, rgba((255, 255, 255), 40))
    pen.rect(x - w * 0.58, top - 4, x + w * 0.58, top + 14, shade(stone, 0.85))
    pen.poly([(x - w * 0.62, top), (x, top - w * 1.1), (x + w * 0.62, top)], roof)
    pen.poly([(x, top - w * 1.1), (x + w * 0.62, top), (x + w * 0.1, top)], shade(roof, 0.75))
    for k in range(3):
        pen.line([(x - w * (0.5 - k * 0.12), top - 2), (x - w * 0.02, top - w * (1.0 - k * 0.12))], shade(roof, 1.15), 2)
    pen.line([(x, top - w * 1.1), (x, top - w * 1.5)], (80, 70, 60), 3)
    pen.poly([(x, top - w * 1.5), (x + w * 0.42, top - w * 1.42), (x, top - w * 1.33)], flag)
    for k in range(2):
        wy = top + (base - top) * (0.25 + 0.3 * k)
        pen.rect(x - w * 0.07, wy, x + w * 0.07, wy + w * 0.32, (52, 48, 60), r=w * 0.07)


def house(pen, x, base, w, h, seed=1, night=False, roof_h=None):
    """A timber-framed town house: stone footing, two storeys of windows with
    shutters and flower boxes, a tiled roof, a chimney."""
    rnd = random.Random(seed)
    walls = [(238, 222, 186), (232, 206, 170), (222, 214, 196), (240, 230, 206), (226, 196, 160)]
    roofs = [(176, 72, 56), (150, 84, 66), (88, 104, 150), (120, 92, 76), (168, 96, 60)]
    wall, roof = rnd.choice(walls), rnd.choice(roofs)
    if night:
        wall, roof = mix(wall, (70, 80, 120), 0.62), mix(roof, (40, 46, 80), 0.55)
    timber = (98, 64, 42) if not night else (44, 38, 52)
    rh = roof_h or w * 0.42
    top = base - h
    if rnd.random() < 0.8:
        cx = x + w * rnd.uniform(0.62, 0.78)
        pen.rect(cx, top - rh * 0.85, cx + w * 0.1, top - rh * 0.2, shade((150, 110, 96), 0.6 if night else 1))
        pen.rect(cx - w * 0.015, top - rh * 0.9, cx + w * 0.115, top - rh * 0.8, shade((120, 90, 80), 0.6 if night else 1))
    pen.rect(x, top, x + w, base, wall)
    pen.rect(x + w * 0.84, top, x + w, base, shade(wall, 0.86))
    stone_blocks(pen, x, base - h * 0.14, x + w, base, shade((168, 160, 150), 0.6 if night else 1), bw=w / 6, bh=h * 0.07, seed=seed)
    for k in range(5):
        tx = x + w * k / 4
        pen.rect(tx - 3, top, tx + 3, base - h * 0.14, timber)
    for yy in (0.0, 0.48):
        pen.rect(x, top + h * yy, x + w, top + h * yy + 6, timber)
    pen.line([(x + 3, top + h * 0.48), (x + w * 0.25, top + 6)], timber, 4)
    pen.line([(x + w - 3, top + h * 0.48), (x + w * 0.75, top + 6)], timber, 4)
    glass = (255, 214, 130) if night else (120, 160, 196)
    for row in (0.12, 0.56):
        for k in (0.16, 0.62):
            wx, wy = x + w * k, top + h * row
            ww, wh = w * 0.2, h * 0.22
            if row > 0.5 and abs(k - 0.62) < 0.01 and h > 150:
                continue
            pen.rect(wx - 4, wy - 4, wx + ww + 4, wy + wh + 4, timber, r=3)
            pen.rect(wx, wy, wx + ww, wy + wh, glass, r=2)
            if not night:
                pen.rect(wx + 3, wy + 3, wx + ww * 0.35, wy + wh * 0.4, (176, 206, 230), r=2)
            pen.rect(wx + ww / 2 - 2, wy, wx + ww / 2 + 2, wy + wh, timber)
            pen.rect(wx, wy + wh / 2 - 2, wx + ww, wy + wh / 2 + 2, timber)
            sh = (64, 112, 86) if seed % 2 else (128, 70, 64)
            sh = mix(sh, (40, 40, 70), 0.6) if night else sh
            pen.rect(wx - ww * 0.32, wy - 2, wx - 5, wy + wh + 2, sh, r=2)
            pen.rect(wx + ww + 5, wy - 2, wx + ww * 1.32, wy + wh + 2, sh, r=2)
            if row < 0.5 and not night:
                pen.rect(wx - 6, wy + wh + 4, wx + ww + 6, wy + wh + 16, (120, 80, 50), r=3)
                for f in range(5):
                    pen.ellipse(wx + ww * f / 4, wy + wh + 3, 6, 5, rnd.choice([(232, 80, 90), (250, 200, 80), (240, 150, 200)]))
                    pen.ellipse(wx + ww * f / 4 + 4, wy + wh + 7, 5, 4, (70, 140, 70))
    dx = x + w * 0.62
    if h > 150:
        pen.rect(dx - 4, base - h * 0.4 - 4, dx + w * 0.22 + 4, base + 1, timber, r=w * 0.1)
        pen.rect(dx, base - h * 0.4, dx + w * 0.22, base, (128, 80, 48) if not night else (60, 46, 50), r=w * 0.09)
        pen.ellipse(dx + w * 0.17, base - h * 0.2, 3, 3, (230, 200, 120))
    eave = top + 6
    pen.poly([(x - w * 0.08, eave), (x + w * 0.5, top - rh), (x + w * 1.08, eave)], roof)
    pen.poly([(x + w * 0.5, top - rh), (x + w * 1.08, eave), (x + w * 0.5, eave)], shade(roof, 0.82))
    for r in range(1, 6):
        t = r / 6
        yy = top - rh + rh * t
        half = (w * 0.58) * t
        pen.line([(x + w * 0.5 - half, yy), (x + w * 0.5 + half, yy)], shade(roof, 0.72), 2)
    pen.line([(x - w * 0.08, eave), (x + w * 1.08, eave)], shade(roof, 0.6), 5)


# --- Environments ------------------------------------------------------------------

def env_meadow_sky(img, cam):
    sky(img, (112, 176, 236), (220, 238, 248), GROUND_Y + 40)
    sun_glow(img, 260, 120, 260, (255, 250, 220), 0.8)


def env_meadow_clouds(img, cam):
    pen = Pen(img, cam, 0.12)
    rnd = random.Random(11)
    for k in range(7):
        cloud(pen, -100 + k * 300 + rnd.uniform(-60, 60), rnd.uniform(90, 260), rnd.uniform(200, 320), seed=k + 3)


def env_meadow_hills(img, cam):
    haze = (206, 226, 236)
    far = Pen(img, cam, 0.25)
    ridge = hill_band(far, GROUND_Y - 170, 40, mix((120, 160, 120), haze, 0.55), seed=3, freq=0.6)
    # small trees standing on the far ridge (not floating above it)
    for x, y in ridge[1:-1:7]:
        leaf_mass(far, x, y + 4, 20, mix((86, 132, 90), haze, 0.5), seed=int(x), n=6, specks=False)
    mid = Pen(img, cam, 0.5)
    pts = hill_band(mid, GROUND_Y - 90, 34, mix((112, 168, 86), haze, 0.25), seed=7, freq=0.8)
    for k in range(0, len(pts) - 2, 9):
        x, y = pts[k + 1]
        mid.line([(x - 40, y + 12), (x + 60, y + 22)], mix((92, 150, 74), haze, 0.25), 6)
    near = Pen(img, cam, 0.75)
    hill_band(near, GROUND_Y - 30, 18, (118, 178, 86), seed=9, freq=1.2)
    tufts(near, -200, W + 200, GROUND_Y - 40, GROUND_Y - 6, 160, [(96, 156, 70), (140, 196, 100)], seed=9, size=(6, 14))


def env_meadow_trees(img, cam):
    pen = Pen(img, cam, 0.82)
    for x, h, s in ((70, 230, 1), (330, 170, 2), (1270, 190, 3), (1520, 250, 4)):
        broadleaf(pen, x, GROUND_Y - 4, h, leaf=(84, 150, 72), seed=s, roots=False)
    for x in (200, 540, 1080, 1400):
        pebbles(pen, x - 30, x + 30, GROUND_Y - 8, GROUND_Y - 2, 3, (150, 148, 140), seed=x, size=(8, 16))


def env_forest(img, cam):
    haze = (208, 222, 170)
    sky(img, (170, 204, 140), (236, 230, 176), GROUND_Y - 60)
    sun_glow(img, 1100, 260, 380, (255, 244, 200), 0.75)
    rnd = random.Random(21)
    far = Pen(img, cam, 0.25)
    x0, x1 = cam.span(0.25)
    x = x0
    while x < x1:
        w = rnd.uniform(14, 28)
        far.rect(x - w / 2, -400, x + w / 2, GROUND_Y, mix((96, 110, 80), haze, 0.62))
        x += rnd.uniform(46, 90)
    for k in range(int((x1 - x0) / 120) + 2):
        leaf_mass(far, x0 + k * 120, rnd.uniform(-40, 90), 90, mix((70, 118, 70), haze, 0.55), seed=k + 40, n=7, specks=False)
    hill_band(far, GROUND_Y - 30, 10, mix((90, 130, 70), haze, 0.5), seed=4)
    mid = Pen(img, cam, 0.55)
    x0, x1 = cam.span(0.55)
    x = x0
    while x < x1:
        w = rnd.uniform(36, 64)
        trunk(mid, x, GROUND_Y, -300, w, mix((96, 72, 52), haze, 0.32), seed=int(x), roots=True, taper=0.9)
        x += rnd.uniform(150, 240)
    for k in range(int((x1 - x0) / 170) + 2):
        leaf_mass(mid, x0 + k * 170 + rnd.uniform(-40, 40), rnd.uniform(-30, 110), 150, mix((58, 108, 58), haze, 0.25), seed=k + 70, n=10)
    for k in range(int((x1 - x0) / 140) + 2):
        bx = x0 + k * 140 + rnd.uniform(-30, 30)
        leaf_mass(mid, bx, GROUND_Y - 26, 52, mix((66, 120, 62), haze, 0.25), seed=k + 90, n=7)
    near = Pen(img, cam, 0.85)
    for x, w in ((60, 120), (1540, 140)):
        trunk(near, x, GROUND_Y + 4, -300, w, (88, 64, 46), seed=int(x) + 3, roots=True, taper=0.92)
    for k in range(10):
        leaf_mass(near, -100 + k * 200, -40 + rnd.uniform(-20, 40), 150, (44, 92, 52), seed=k + 120, n=9)
    # ferns along the ground line
    fern = Pen(img, cam, 0.92)
    for k in range(18):
        fx = -150 + k * 110 + rnd.uniform(-30, 30)
        for a in range(-3, 4):
            ang = -math.pi / 2 + a * 0.32
            L = rnd.uniform(26, 44)
            fern.line([(fx, GROUND_Y + 2), (fx + math.cos(ang) * L, GROUND_Y + 2 + math.sin(ang) * L)], (62, 120, 60) if a % 2 else (84, 146, 70), 4)


def twisted(pen, x, base, top, w, color, seed=1, amp=40):
    rnd = random.Random(seed)
    ph, fr = rnd.uniform(0, 6.3), rnd.uniform(1.2, 2.2)
    n = 16
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = base - (base - top) * t
        cx = x + math.sin(t * fr * math.pi + ph) * amp * t
        ww = w * (1.25 - 0.55 * t)
        left.append((cx - ww / 2, y))
        right.append((cx + ww / 2, y))
    pen.poly(left + list(reversed(right)), color)
    pen.poly([((l[0] + r[0]) / 2 + (r[0] - l[0]) * 0.1, l[1]) for l, r in zip(left, right)] + list(reversed(right)), shade(color, 0.72))
    pen.line([((l[0] * 0.8 + r[0] * 0.2), l[1]) for l, r in zip(left, right)], shade(color, 1.3), w * 0.07)
    return [((l[0] + r[0]) / 2, l[1]) for l, r in zip(left, right)]


def env_enchanted(img, cam):
    haze = (90, 150, 170)
    sky(img, (34, 26, 70), (78, 164, 160), GROUND_Y - 20)
    sun_glow(img, 800, 420, 520, (150, 255, 220), 0.45)
    rnd = random.Random(31)
    far = Pen(img, cam, 0.25)
    x0, x1 = cam.span(0.25)
    x = x0
    while x < x1:
        twisted(far, x, GROUND_Y, -100, rnd.uniform(16, 26), mix((70, 54, 120), haze, 0.55), seed=int(x), amp=24)
        x += rnd.uniform(60, 110)
    for k in range(int((x1 - x0) / 130) + 2):
        leaf_mass(far, x0 + k * 130, rnd.uniform(0, 120), 80, mix((60, 160, 150), haze, 0.5), seed=k + 4, n=6, specks=False)
    mid = Pen(img, cam, 0.55)
    x0, x1 = cam.span(0.55)
    x = x0
    while x < x1:
        spine = twisted(mid, x, GROUND_Y, -200, rnd.uniform(40, 62), (92, 62, 140), seed=int(x) + 1, amp=50)
        for i in (6, 10):
            bx, by = spine[i]
            side = rnd.choice([-1, 1])
            mid.line([(bx, by), (bx + side * 90, by - 70), (bx + side * 150, by - 60)], (82, 56, 128), 10)
            leaf_mass(mid, bx + side * 150, by - 70, 46, (70, 200, 178), seed=int(bx), n=7, light=(170, 255, 230))
        x += rnd.uniform(190, 280)
    for k in range(int((x1 - x0) / 160) + 2):
        leaf_mass(mid, x0 + k * 160, rnd.uniform(-40, 80), 130, (58, 168, 156), seed=k + 60, n=9, light=(160, 250, 226))
    # hanging vines with glowing buds
    vines = Pen(img, cam, 0.7)
    for k in range(14):
        vx = -100 + k * 140 + rnd.uniform(-40, 40)
        L = rnd.uniform(120, 300)
        pts = [(vx + math.sin(t / 3) * 10, t * L / 10) for t in range(11)]
        vines.line(pts, (60, 120, 110), 3)
        for t in range(2, 11, 3):
            bx, by = pts[t]
            vines.ellipse(bx, by, 6, 6, (200, 255, 230))
            vines.ellipse(bx, by, 11, 11, (160, 255, 220, 60))
    # glowing mist low between the trees
    lay = new_layer()
    ImageDraw.Draw(lay).rectangle([0, (GROUND_Y - 140) * S, W * S, (GROUND_Y + 10) * S], fill=(150, 255, 230, 90))
    soft(img, lay, blur=40)
    bushes = Pen(img, cam, 0.9)
    for k in range(14):
        leaf_mass(bushes, -100 + k * 140 + rnd.uniform(-30, 30), GROUND_Y - 14, 44, (46, 118, 112), seed=k + 200, n=7, light=(120, 230, 200))


def env_water(img, cam):
    haze = (220, 238, 244)
    sky(img, (168, 210, 234), (232, 244, 248), GROUND_Y - 40)
    sun_glow(img, 820, 250, 420, (255, 255, 245), 0.7)
    rnd = random.Random(41)
    for depth, n, op in ((0.2, 0, 0.7), (0.45, 0, 0.35), (0.75, 0, 0.0)):
        pen = Pen(img, cam, depth)
        x0, x1 = cam.span(depth)
        x = x0
        while x < x1:
            w = rnd.uniform(18, 30) * (0.6 + depth)
            birch(pen, x, GROUND_Y, -200, w, seed=int(x * 3),
                  foliage=mix((168, 214, 212), haze, op * 0.8), bark=mix((236, 240, 242), haze, op * 0.5))
            x += rnd.uniform(90, 170) * (0.6 + depth)
        if depth < 0.7:
            lay = new_layer()
            ImageDraw.Draw(lay).rectangle([0, (GROUND_Y - 260) * S, W * S, (GROUND_Y + 10) * S], fill=rgba(haze, 120))
            soft(img, lay, blur=50)
    reeds = Pen(img, cam, 0.92)
    tufts(reeds, -200, W + 200, GROUND_Y - 2, GROUND_Y + 4, 60, [(110, 160, 130), (150, 196, 160)], seed=41, size=(30, 60))


def env_town(img, cam):
    haze = (206, 224, 238)
    sky(img, (120, 184, 238), (226, 238, 248), GROUND_Y)
    sun_glow(img, 300, 140, 260, (255, 250, 220), 0.7)
    cl = Pen(img, cam, 0.1)
    for k in range(5):
        cloud(cl, 100 + k * 360, 110 + 50 * (k % 2), 240, seed=k + 20)
    far = Pen(img, cam, 0.15)
    tree_with_castle(far, 1260, GROUND_Y - 120, 330, haze=0.55)
    back = Pen(img, cam, 0.4)
    rnd = random.Random(51)
    x0, x1 = cam.span(0.4)
    x = x0
    while x < x1:
        w = rnd.uniform(120, 170)
        h = rnd.uniform(160, 230)
        hcol = mix((200, 180, 160), haze, 0.55)
        back.rect(x, GROUND_Y - h, x + w, GROUND_Y, hcol)
        back.poly([(x - 8, GROUND_Y - h), (x + w / 2, GROUND_Y - h - w * 0.4), (x + w + 8, GROUND_Y - h)], mix((160, 90, 74), haze, 0.5))
        for k in range(3):
            back.rect(x + w * (0.15 + 0.3 * k), GROUND_Y - h * 0.75, x + w * (0.27 + 0.3 * k), GROUND_Y - h * 0.55, mix((110, 140, 170), haze, 0.5))
        x += w + rnd.uniform(4, 20)
    front = Pen(img, cam, 0.7)
    x0, x1 = cam.span(0.7)
    x = x0
    k = 0
    prev = None
    while x < x1:
        w = rnd.uniform(200, 260)
        h = rnd.uniform(250, 320)
        house(front, x, GROUND_Y, w, h, seed=k + 3)
        if prev:
            front.line([(prev[0], prev[1]), ((prev[0] + x + w * 0.1) / 2, prev[1] + 40), (x + w * 0.1, GROUND_Y - h + 10)], (90, 70, 60), 2)
            for t in range(1, 8):
                bx = prev[0] + (x + w * 0.1 - prev[0]) * t / 8
                by = prev[1] + 40 * math.sin(math.pi * t / 8)
                front.poly([(bx - 9, by), (bx + 9, by), (bx, by + 18)], [(220, 70, 70), (250, 200, 80), (80, 140, 210)][t % 3])
        prev = (x + w * 0.9, GROUND_Y - h + 10)
        x += w + rnd.uniform(14, 40)
        k += 1


def tree_with_castle(pen, x, base, h, haze=0.0, sky=(206, 224, 238)):
    """The great World Tree with the royal castle built among its roots."""
    hz = lambda c: mix(c, sky, haze)
    w = h * 0.34
    trunk(pen, x, base, base - h * 0.62, w, hz((122, 96, 76)), seed=5, roots=True, taper=0.8)
    r = h * 0.5
    for k, (ox, oy, s) in enumerate(((-0.7, 0.05, 0.7), (0.7, 0.0, 0.72), (0.0, -0.3, 0.95), (-0.35, 0.25, 0.6), (0.4, 0.22, 0.6))):
        leaf_mass(pen, x + ox * r, base - h * 0.7 + oy * r, r * s, hz((128, 176, 120)), seed=k + 300, n=10, light=hz((176, 214, 160)))
    stone = hz((196, 198, 210))
    roof = hz((84, 104, 168))
    pen.rect(x - w * 0.9, base - h * 0.2, x + w * 0.9, base, stone)
    crenels(pen, x - w * 0.9, x + w * 0.9, base - h * 0.2, h * 0.03, h * 0.035, h * 0.025, stone)
    for tx, th, tw in ((x - w * 0.75, h * 0.36, w * 0.36), (x + w * 0.75, h * 0.36, w * 0.36), (x, h * 0.56, w * 0.46)):
        pen.rect(tx - tw / 2, base - th, tx + tw / 2, base, stone)
        pen.rect(tx + tw * 0.15, base - th, tx + tw / 2, base, shade(stone, 0.86))
        pen.poly([(tx - tw * 0.62, base - th), (tx, base - th - tw * 1.3), (tx + tw * 0.62, base - th)], roof)
        pen.rect(tx - tw * 0.1, base - th * 0.7, tx + tw * 0.1, base - th * 0.55, hz((70, 70, 90)), r=tw * 0.1)
    pen.rect(x - w * 0.16, base - h * 0.14, x + w * 0.16, base, hz((90, 70, 60)), r=w * 0.16)


def env_walls(img, cam):
    haze = (214, 228, 238)
    sky(img, (120, 178, 232), (222, 236, 246), GROUND_Y)
    cl = Pen(img, cam, 0.1)
    for k in range(4):
        cloud(cl, 150 + k * 420, 90 + 40 * (k % 2), 260, seed=k + 30)
    far = Pen(img, cam, 0.25)
    hill_band(far, GROUND_Y - 160, 30, mix((120, 160, 120), haze, 0.5), seed=3)
    wall = Pen(img, cam, 0.72)
    x0, x1 = cam.span(0.72)
    top = GROUND_Y - 420
    stone = (168, 164, 178)
    stone_blocks(wall, x0, top, x1, GROUND_Y, stone, bw=74, bh=36, seed=5, moss=(92, 140, 80))
    crenels(wall, x0, x1, top, 46, 54, 34, stone)
    wall.rect(x0, top + 6, x1, top + 18, shade(stone, 0.8))
    for x in range(int(x0 // 260) * 260, int(x1) + 1, 260):
        wall.rect(x + 120, top + 120, x + 136, top + 190, (58, 54, 68), r=6)
    for x in (230, 1370):
        round_tower(wall, x, GROUND_Y, GROUND_Y - 560, 200, stone=(176, 172, 186), seed=x)
    ivy = Pen(img, cam, 0.74)
    rnd = random.Random(61)
    for k in range(7):
        ix = rnd.uniform(x0, x1)
        for j in range(8):
            leaf_mass(ivy, ix + rnd.uniform(-30, 30), top + 40 + j * 40 + rnd.uniform(-10, 10), 22, (76, 126, 70), seed=k * 10 + j, n=5, specks=False)
    base = Pen(img, cam, 0.9)
    tufts(base, -200, W + 200, GROUND_Y - 4, GROUND_Y + 2, 120, [(96, 150, 74), (130, 180, 96)], seed=61, size=(12, 30))


def env_city_night(img, cam):
    sky(img, (14, 20, 52), (60, 66, 112), GROUND_Y - 80)
    rnd = random.Random(71)
    d = ImageDraw.Draw(img)
    for _ in range(160):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, 420), rnd.uniform(0.6, 1.8)
        d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=(255, 255, 240, int(rnd.uniform(120, 255))))
    sun_glow(img, 1260, 130, 160, (220, 230, 255), 0.6)
    moon = Pen(img, Cam(), 1.0)
    moon.ellipse(1260, 130, 46, 46, (244, 244, 230))
    moon.ellipse(1278, 120, 40, 40, (226, 230, 220, 120))
    far = Pen(img, cam, 0.3)
    x0, x1 = cam.span(0.3)
    x = x0
    while x < x1:
        w, h = rnd.uniform(90, 150), rnd.uniform(200, 320)
        c = (34, 40, 74)
        far.rect(x, GROUND_Y - h, x + w, GROUND_Y, c)
        far.poly([(x - 6, GROUND_Y - h), (x + w / 2, GROUND_Y - h - w * 0.5), (x + w + 6, GROUND_Y - h)], (28, 32, 62))
        for _ in range(3):
            wx, wy = x + rnd.uniform(0.1, 0.75) * w, GROUND_Y - h * rnd.uniform(0.3, 0.85)
            far.rect(wx, wy, wx + 12, wy + 16, (240, 196, 110) if rnd.random() < 0.6 else (60, 66, 100))
        x += w + rnd.uniform(0, 20)
    front = Pen(img, cam, 0.7)
    x0, x1 = cam.span(0.7)
    x, k = x0, 0
    while x < x1:
        w, h = rnd.uniform(200, 250), rnd.uniform(280, 340)
        house(front, x, GROUND_Y, w, h, seed=k + 11, night=True)
        x += w + rnd.uniform(10, 30)
        k += 1


def env_mountains(img, cam):
    haze = (214, 230, 244)
    sky(img, (110, 168, 226), (226, 238, 248), GROUND_Y - 100)
    sun_glow(img, 1250, 160, 300, (255, 250, 230), 0.6)
    cl = Pen(img, cam, 0.08)
    for k in range(4):
        cloud(cl, 120 + k * 450, 90 + 50 * (k % 2), 230, seed=k + 50)
    far = Pen(img, cam, 0.12)
    for cx, top, half in ((-60, 260, 380), (420, 200, 420), (980, 240, 400), (1500, 180, 440)):
        peak(far, cx, GROUND_Y - 60, top, half, mix((150, 162, 190), haze, 0.55), seed=int(cx) + 900, snow_line=0.36)
    mid = Pen(img, cam, 0.3)
    for cx, top, half in ((180, 300, 380), (800, 230, 460), (1420, 280, 400)):
        peak(mid, cx, GROUND_Y + 10, top, half, mix((128, 132, 156), haze, 0.25), seed=int(cx) + 7, snow_line=0.34)
    lay = new_layer()
    ImageDraw.Draw(lay).rectangle([0, (GROUND_Y - 200) * S, W * S, (GROUND_Y + 20) * S], fill=rgba(haze, 150))
    soft(img, lay, blur=40)
    near = Pen(img, cam, 0.55)
    hill_band(near, GROUND_Y - 70, 40, (126, 118, 112), seed=13, freq=1.4)
    rnd = random.Random(81)
    for k in range(16):
        pine(near, -200 + k * 130 + rnd.uniform(-30, 30), GROUND_Y - 40 + rnd.uniform(-10, 20), rnd.uniform(70, 110), (58, 96, 86), snow=True)


def room_window(pen, cx, top, w, h, night, curtain=(196, 70, 104)):
    """A tall window: the sky (or night) outside, mullions, sill, drapes."""
    frame = (128, 86, 60)
    pen.rect(cx - w / 2 - 14, top - 14, cx + w / 2 + 14, top + h + 22, frame, r=8)
    outside = ((24, 30, 74), (62, 70, 124)) if night else ((132, 192, 238), (220, 236, 246))
    steps = 24
    for i in range(steps):
        t = i / steps
        pen.rect(cx - w / 2, top + h * t, cx + w / 2, top + h * (t + 1 / steps) + 1, mix(outside[0], outside[1], t))
    if night:
        pen.ellipse(cx + w * 0.22, top + h * 0.2, w * 0.08, w * 0.08, (244, 242, 226))
        rnd = random.Random(5)
        for _ in range(16):
            pen.ellipse(cx + rnd.uniform(-0.45, 0.45) * w, top + rnd.uniform(0.05, 0.7) * h, 1.6, 1.6, (255, 255, 230))
    else:
        cloud(pen, cx - w * 0.15, top + h * 0.25, w * 0.4, seed=8)
        hill_band(pen, top + h * 0.82, 8, (140, 190, 120), seed=2, x0=cx - w / 2, x1=cx + w / 2, bottom=top + h)
    for t in (1 / 3, 2 / 3):
        pen.rect(cx - w / 2 + w * t - 4, top, cx - w / 2 + w * t + 4, top + h, frame)
    pen.rect(cx - w / 2, top + h * 0.5 - 4, cx + w / 2, top + h * 0.5 + 4, frame)
    pen.rect(cx - w / 2 - 24, top + h + 8, cx + w / 2 + 24, top + h + 26, shade(frame, 1.15), r=4)
    pen.rect(cx - w / 2 - 50, top - 40, cx + w / 2 + 50, top - 26, (176, 140, 70), r=6)
    for side in (-1, 1):
        x0 = cx + side * (w / 2 + 40)
        x1 = cx + side * (w / 2 - w * 0.12)
        pts = [(x0, top - 30), (x1, top - 30), (x1 + side * w * 0.04, top + h * 0.45), (x0 + side * 4, top + h * 0.62),
               (x0 - side * 10, top + h + 40)]
        pen.poly(pts, curtain)
        for f in range(3):
            fx = x0 + (x1 - x0) * (0.25 + f * 0.25)
            pen.line([(fx, top - 28), (fx + side * 6, top + h * 0.5)], shade(curtain, 0.78), 5)
        pen.ellipse(x0 + side * 4, top + h * 0.6, 12, 8, (230, 190, 90))


def picture(pen, cx, cy, w, h, kind):
    pen.rect(cx - w / 2 - 10, cy - h / 2 - 10, cx + w / 2 + 10, cy + h / 2 + 10, (196, 156, 72), r=4)
    pen.rect(cx - w / 2 - 4, cy - h / 2 - 4, cx + w / 2 + 4, cy + h / 2 + 4, (150, 112, 50))
    if kind == 'landscape':
        pen.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, (150, 200, 230))
        pen.poly([(cx - w / 2, cy + h / 2), (cx - w * 0.1, cy - h * 0.15), (cx + w * 0.2, cy + h * 0.1), (cx + w / 2, cy - h * 0.05), (cx + w / 2, cy + h / 2)], (88, 150, 92))
        pen.ellipse(cx + w * 0.28, cy - h * 0.25, w * 0.08, w * 0.08, (250, 220, 120))
    else:
        pen.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, (238, 214, 226))
        for k in range(6):
            a = k * math.pi / 3
            pen.ellipse(cx + math.cos(a) * w * 0.16, cy + math.sin(a) * w * 0.16, w * 0.13, w * 0.13, (250, 250, 250))
        pen.ellipse(cx, cy, w * 0.11, w * 0.11, (110, 64, 30))


def sconce(pen, x, y):
    pen.rect(x - 6, y, x + 6, y + 40, (200, 160, 80), r=4)
    pen.rect(x - 16, y + 34, x + 16, y + 42, (200, 160, 80), r=3)
    pen.rect(x - 5, y - 26, x + 5, y + 2, (250, 244, 228), r=3)
    pen.ellipse(x, y - 34, 6, 10, (255, 200, 90))
    pen.ellipse(x, y - 32, 3, 6, (255, 250, 210))


def env_princess_room(img, cam, night=False):
    wallc = (238, 202, 216) if not night else (120, 104, 140)
    pen = Pen(img, cam, 0.85)
    x0, x1 = cam.span(0.85, pad=400)
    pen.rect(x0, -600, x1, GROUND_Y, wallc)
    stripe = shade(wallc, 0.94)
    for x in range(int(x0 // 60) * 60, int(x1), 60):
        pen.rect(x, -600, x + 26, GROUND_Y - 200, stripe)
        for y in range(-560, GROUND_Y - 220, 90):
            yy = y + (45 if (x // 60) % 2 else 0)
            pen.ellipse(x + 43, yy, 5, 5, shade(wallc, 1.12))
    pen.rect(x0, -20, x1, 22, (250, 238, 240) if not night else (150, 140, 170))
    pen.rect(x0, 22, x1, 32, (200, 160, 90))
    wood = (156, 100, 72) if not night else (90, 64, 70)
    pen.rect(x0, GROUND_Y - 200, x1, GROUND_Y, wood)
    pen.rect(x0, GROUND_Y - 210, x1, GROUND_Y - 194, shade(wood, 1.2))
    for x in range(int(x0 // 140) * 140, int(x1), 140):
        pen.rect(x + 16, GROUND_Y - 176, x + 124, GROUND_Y - 24, shade(wood, 0.86), r=4)
        pen.rect(x + 22, GROUND_Y - 170, x + 118, GROUND_Y - 30, shade(wood, 1.06), r=3)
    pen.rect(x0, GROUND_Y - 18, x1, GROUND_Y, shade(wood, 0.8))
    room_window(pen, 800, 110, 360, 330, night)
    picture(pen, 250, 230, 170, 120, 'landscape')
    picture(pen, 1360, 230, 110, 110, 'flower')
    for x in (520, 1080):
        sconce(pen, x, 300)
    if night:
        sun_glow(img, cam.x(800, 0.85), 260, 220, (150, 170, 230), 0.4)
    else:
        sun_glow(img, cam.x(800, 0.85), 280, 300, (255, 250, 230), 0.45)


def env_library(img, cam):
    pen = Pen(img, cam, 0.6)
    x0, x1 = cam.span(0.6, pad=400)
    pen.rect(x0, -600, x1, GROUND_Y, (84, 56, 40))
    for cx in (360, 800, 1240):
        w, top, h = 200, 60, 420
        pen.rect(cx - w / 2 - 16, top - 16, cx + w / 2 + 16, top + h, (120, 84, 56))
        pen.ellipse(cx, top + 90, w / 2 + 16, 106, (120, 84, 56))
        for i in range(20):
            t = i / 20
            pen.rect(cx - w / 2, top + 90 + (h - 90) * t, cx + w / 2, top + 90 + (h - 90) * (t + 0.05) + 1, mix((60, 80, 140), (110, 130, 180), t))
        pen.ellipse(cx, top + 90, w / 2, 96, (60, 80, 140))
        pen.rect(cx - 3, top, cx + 3, top + h, (96, 66, 44))
        pen.rect(cx - w / 2, top + 220, cx + w / 2, top + 226, (96, 66, 44))
    shelf_unit(pen, 470, 1130, -200, GROUND_Y, seed=3)
    shelf_unit(pen, -400, 250, -200, GROUND_Y, seed=4)
    shelf_unit(pen, 1350, 2000, -200, GROUND_Y, seed=5)
    pen.rect(x0, 260, x1, 280, (120, 80, 50))
    for x in range(int(x0 // 40) * 40, int(x1), 40):
        pen.rect(x, 280, x + 8, 330, (120, 80, 50))
    pen.rect(x0, 326, x1, 336, (100, 66, 42))
    pen.line([(560, 336), (520, GROUND_Y)], (110, 74, 46), 8)
    pen.line([(620, 336), (580, GROUND_Y)], (110, 74, 46), 8)
    for k in range(9):
        y = 360 + k * 40
        pen.line([(556 - k * 4.4, y), (616 - k * 4.4, y)], (110, 74, 46), 6)
    ch = Pen(img, cam, 0.75)
    ch.line([(800, -100), (800, 110)], (60, 50, 40), 4)
    ch.ellipse(800, 130, 120, 26, (190, 150, 70))
    for k in range(7):
        x = 690 + k * 36.6
        ch.rect(x - 5, 92, x + 5, 120, (250, 240, 220))
        ch.ellipse(x, 84, 5, 9, (255, 210, 110))
    sun_glow(img, cam.x(800, 0.75), cam.y(110, 0.75), 260, (255, 210, 140), 0.55)


def shelf_unit(pen, x0, x1, y0, y1, seed=1, wood=(110, 72, 46)):
    rnd = random.Random(seed)
    books = [(150, 58, 58), (58, 88, 150), (68, 128, 80), (200, 160, 70), (120, 70, 140), (180, 110, 60), (90, 60, 50), (60, 120, 130)]
    pen.rect(x0, y0, x1, y1, shade(wood, 0.62))
    sh = 96
    y = y1 - 20
    while y - sh > y0:
        x = x0 + 12
        while x < x1 - 18:
            bw = rnd.uniform(10, 22)
            bh = sh * rnd.uniform(0.62, 0.9)
            c = rnd.choice(books)
            if rnd.random() < 0.1:
                pen.poly([(x, y - 4), (x + bw, y - 4), (x + bw + bh * 0.3, y - bh), (x + bh * 0.3, y - bh)], c)
                x += bw + bh * 0.3
            else:
                pen.rect(x, y - bh, min(x1 - 10, x + bw), y - 4, c)
                pen.rect(x + bw * 0.2, y - bh * 0.8, min(x1 - 10, x + bw * 0.8), y - bh * 0.72, (230, 200, 120))
                x += bw + 1.5
        pen.rect(x0, y - 4, x1, y + 8, wood)
        pen.rect(x0, y - 4, x1, y, shade(wood, 1.25))
        y -= sh
    pen.rect(x0, y0, x0 + 14, y1, wood)
    pen.rect(x1 - 14, y0, x1, y1, shade(wood, 0.85))


def env_castle_hall(img, cam):
    pen = Pen(img, cam, 0.75)
    x0, x1 = cam.span(0.75, pad=400)
    stone = (176, 170, 184)
    stone_blocks(pen, x0, -600, x1, GROUND_Y, stone, bw=90, bh=44, seed=7)
    for cx in (200, 600, 1000, 1400):
        w, top, h = 170, 80, 430
        pen.rect(cx - w / 2 - 18, top - 18, cx + w / 2 + 18, top + h + 10, shade(stone, 0.8))
        pen.ellipse(cx, top + 80, w / 2 + 18, 98, shade(stone, 0.8))
        pen.rect(cx - w / 2, top + 80, cx + w / 2, top + h, (190, 222, 244))
        pen.ellipse(cx, top + 80, w / 2, 86, (190, 222, 244))
        pen.rect(cx - w / 2, top + h * 0.6, cx + w / 2, top + h, (210, 232, 246))
        for t in (0.33, 0.66):
            pen.rect(cx - w / 2 + w * t - 3, top, cx - w / 2 + w * t + 3, top + h, shade(stone, 0.6))
    for cx in (400, 800, 1200):
        pen.rect(cx - 36, -600, cx + 36, GROUND_Y, shade(stone, 1.08))
        pen.rect(cx + 10, -600, cx + 36, GROUND_Y, shade(stone, 0.86))
        pen.rect(cx - 46, GROUND_Y - 40, cx + 46, GROUND_Y, shade(stone, 0.9))
        pen.rect(cx - 46, 40, cx + 46, 66, shade(stone, 0.9))
    lay = new_layer()
    d = ImageDraw.Draw(lay)
    for cx in (200, 600, 1000, 1400):
        x = cam.x(cx, 0.75)
        d.polygon([((x - 70) * S, 120 * S), ((x + 70) * S, 120 * S), ((x + 300) * S, H * S), ((x + 80) * S, H * S)], fill=(255, 246, 210, 70))
    soft(img, lay, blur=30)


def env_seer_house(img, cam):
    pen = Pen(img, cam, 0.8)
    x0, x1 = cam.span(0.8, pad=400)
    plank = (120, 84, 58)
    pen.rect(x0, -600, x1, GROUND_Y, plank)
    rnd = random.Random(91)
    for x in range(int(x0 // 46) * 46, int(x1), 46):
        pen.rect(x, -600, x + 3, GROUND_Y, shade(plank, 0.7))
        for _ in range(3):
            y = rnd.uniform(-200, GROUND_Y)
            pen.ellipse(x + 23, y, 4, 7, shade(plank, 0.78))
    for y in (40, 300):
        pen.rect(x0, y, x1, y + 34, (92, 62, 42))
    for k in range(14):
        hx = 120 + k * 110 + rnd.uniform(-20, 20)
        pen.line([(hx, 74), (hx, 120)], (70, 60, 40), 2)
        for j in range(5):
            pen.ellipse(hx + rnd.uniform(-10, 10), 130 + j * 10, 8, 14, rnd.choice([(110, 140, 70), (150, 120, 70), (170, 90, 120)]))
    cx, cy, r = 760, 190, 92
    pen.ellipse(cx, cy, r + 18, r + 18, (92, 62, 42))
    pen.ellipse(cx, cy, r, r, (34, 40, 80))
    for _ in range(40):
        a, d = rnd.uniform(0, 6.3), rnd.uniform(0, r * 0.9)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        pen.line([(x, y), (x - 4, y + 12)], (150, 170, 220), 1.5)
    pen.rect(cx - 4, cy - r, cx + 4, cy + r, (92, 62, 42))
    pen.rect(cx - r, cy - 4, cx + r, cy + 4, (92, 62, 42))
    for sx in (250, 1300):
        for row in range(2):
            y = 380 + row * 110
            pen.rect(sx - 140, y, sx + 140, y + 14, (96, 64, 42))
            x = sx - 128
            while x < sx + 120:
                c = rnd.choice([(80, 170, 120), (170, 80, 120), (90, 120, 200), (210, 170, 70), (150, 100, 200)])
                bw, bh = rnd.uniform(18, 30), rnd.uniform(36, 70)
                pen.rect(x, y - bh, x + bw, y, rgba(c, 220), r=bw * 0.35)
                pen.rect(x + bw * 0.3, y - bh - 12, x + bw * 0.7, y - bh + 2, (150, 110, 70))
                pen.rect(x + bw * 0.2, y - bh * 0.8, x + bw * 0.4, y - bh * 0.3, (255, 255, 255, 90))
                x += bw + rnd.uniform(6, 14)
    sun_glow(img, cam.x(760, 0.8), cam.y(190, 0.8), 160, (120, 150, 230), 0.35)


ENVS = {
    'meadow_01_sky': env_meadow_sky, 'meadow_02_clouds': env_meadow_clouds, 'meadow_03_hills': env_meadow_hills,
    'meadow_04_trees_stones': env_meadow_trees, 'deep-forest': env_forest, 'enchanted-forest': env_enchanted,
    'water-forest': env_water, 'town': env_town, 'castle-walls': env_walls, 'city-night': env_city_night,
    'mountains': env_mountains, 'library': env_library, 'princess-room-day': env_princess_room,
    'princess-room-night': lambda img, cam: env_princess_room(img, cam, night=True),
    'castle-hall-day': env_castle_hall, 'seer-house': env_seer_house,
}
PLACE = {
    'meadow_01_sky': 'meadow', 'meadow_02_clouds': 'meadow', 'meadow_03_hills': 'meadow', 'meadow_04_trees_stones': 'meadow',
    'deep-forest': 'forest', 'enchanted-forest': 'enchanted', 'water-forest': 'water', 'town': 'town',
    'castle-walls': 'walls', 'city-night': 'night', 'mountains': 'mountains', 'library': 'library',
    'princess-room-day': 'room', 'princess-room-night': 'room-night', 'castle-hall-day': 'hall', 'seer-house': 'seer',
}


def layer_name(path):
    return os.path.splitext(os.path.basename(path))[0]


# --- Grounds -----------------------------------------------------------------------

def ground_plane(img, cam, top, bottom, seed):
    """Vertical colour gradient for a ground from the horizon line down."""
    pen = Pen(img, cam, 1.0)
    steps = 30
    y0, y1 = GROUND_Y, GROUND_Y + (H - GROUND_Y) / cam.zoom + 60
    x0, x1 = cam.span(1.0)
    for i in range(steps):
        t = i / steps
        pen.rect(x0, y0 + (y1 - y0) * t, x1, y0 + (y1 - y0) * (t + 1 / steps) + 1, mix(top, bottom, t))
    return pen, x0, x1, y0, y1


def paint_ground(img, cam, kind, place, tint=None):
    rnd_seed = 7
    if kind == 'grass':
        palette = {
            'meadow': ((126, 184, 88), (82, 140, 60), [(98, 160, 70), (150, 204, 104), (76, 132, 58)]),
            'forest': ((96, 134, 66), (58, 92, 46), [(76, 120, 56), (112, 156, 78), (52, 88, 44)]),
            'enchanted': ((64, 120, 112), (34, 72, 78), [(70, 150, 130), (110, 200, 170), (40, 90, 90)]),
            'water': ((150, 192, 150), (106, 156, 120), [(124, 176, 136), (170, 210, 170), (96, 146, 116)]),
            'walls': ((122, 176, 86), (82, 136, 60), [(98, 156, 70), (146, 198, 100)]),
            'mountains': ((132, 160, 110), (98, 124, 86), [(116, 146, 96), (156, 180, 130)]),
        }
        if place == 'town':
            paint_cobbles(img, cam, (182, 166, 140), (150, 136, 116))
            return
        top, bottom, blades = palette.get(place, palette['meadow'])
        pen, x0, x1, y0, y1 = ground_plane(img, cam, top, bottom, rnd_seed)
        rnd = random.Random(3)
        for _ in range(int((x1 - x0) / 60)):
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0 + 10, y1)
            pen.ellipse(x, y, rnd.uniform(40, 110), rnd.uniform(6, 14), shade(top, rnd.uniform(0.9, 1.08)))
        tufts(pen, x0, x1, y0 + 4, y1, int((x1 - x0) * 0.18), blades, seed=11, size=(10, 26))
        if place in ('meadow', 'walls', 'mountains', 'water'):
            blossoms(pen, x0, x1, y0 + 14, y1, int((x1 - x0) * 0.02), seed=12, size=4)
        if place == 'forest':
            leaves = random.Random(13)
            for _ in range(int((x1 - x0) * 0.05)):
                x, y = leaves.uniform(x0, x1), leaves.uniform(y0 + 6, y1)
                pen.ellipse(x, y, 7, 3.5, leaves.choice([(196, 140, 64), (170, 96, 50), (214, 176, 80)]))
        if place == 'enchanted':
            glow = random.Random(14)
            for _ in range(int((x1 - x0) * 0.03)):
                x, y = glow.uniform(x0, x1), glow.uniform(y0 + 6, y1)
                pen.ellipse(x, y, 3, 3, (190, 255, 230))
        pebbles(pen, x0, x1, y0 + 10, y1, int((x1 - x0) * 0.01), (156, 150, 140), seed=15)
        # the edge where the ground meets the scene: a soft fringe of blades
        tufts(pen, x0, x1, y0 - 2, y0 + 6, int((x1 - x0) * 0.12), blades, seed=16, size=(8, 18))
    elif kind == 'stone':
        if place == 'library':
            paint_boards(img, cam, (128, 88, 60), (94, 62, 42))
        else:
            paint_cobbles(img, cam, (70, 76, 100), (46, 50, 74), wet=True)
    elif kind == 'castle':
        if place in ('seer', 'room-night'):
            paint_boards(img, cam, (132, 92, 62), (96, 66, 44))
        else:
            paint_slabs(img, cam, (170, 164, 176), (140, 134, 148), runner=place == 'hall')
    elif kind == 'carpet':
        paint_boards(img, cam, (150, 100, 70), (112, 74, 52))
        pen = Pen(img, cam, 1.0)
        pen.ellipse(800, GROUND_Y + 110, 620, 90, (200, 120, 150))
        pen.ellipse(800, GROUND_Y + 110, 580, 78, (226, 156, 180))
        pen.ellipse(800, GROUND_Y + 110, 480, 56, (240, 200, 214))
    elif kind == 'snow':
        pen, x0, x1, y0, y1 = ground_plane(img, cam, (232, 240, 250), (200, 214, 236), rnd_seed)
        rnd = random.Random(21)
        for _ in range(int((x1 - x0) / 50)):
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0 + 10, y1)
            pen.ellipse(x, y, rnd.uniform(50, 130), rnd.uniform(6, 16), rnd.choice([(212, 224, 244), (246, 250, 255)]))
        pebbles(pen, x0, x1, y0 + 10, y1, int((x1 - x0) * 0.008), (120, 118, 124), seed=22, size=(6, 14))
        for _ in range(int((x1 - x0) * 0.04)):
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
            pen.ellipse(x, y, 1.6, 1.6, (255, 255, 255))
    elif kind == 'rock':
        pen, x0, x1, y0, y1 = ground_plane(img, cam, (150, 140, 128), (110, 100, 92), rnd_seed)
        rnd = random.Random(31)
        for _ in range(int((x1 - x0) / 40)):
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0 + 8, y1)
            L = rnd.uniform(20, 60)
            pen.line([(x, y), (x + L * 0.5, y + rnd.uniform(-4, 4)), (x + L, y + rnd.uniform(-6, 6))], (96, 88, 80), 2)
        pebbles(pen, x0, x1, y0 + 6, y1, int((x1 - x0) * 0.05), (164, 156, 146), seed=32, size=(4, 12))
        tufts(pen, x0, x1, y0, y1, int((x1 - x0) * 0.01), [(120, 140, 100)], seed=33, size=(8, 16))
    if tint and place != 'enchanted':
        pass


def paint_cobbles(img, cam, light_c, dark_c, wet=False):
    pen, x0, x1, y0, y1 = ground_plane(img, cam, light_c, dark_c, 1)
    rnd = random.Random(41)
    y, row = y0 + 4, 0
    while y < y1:
        t = (y - y0) / max(1, (H - GROUND_Y))
        h = 8 + 26 * t
        w = h * 1.7
        x = x0 - (w / 2) * (row % 2)
        while x < x1:
            c = shade(mix(light_c, dark_c, t), rnd.uniform(0.86, 1.12))
            pen.ellipse(x + w / 2, y + h / 2, w * 0.46, h * 0.42, c)
            pen.ellipse(x + w * 0.42, y + h * 0.38, w * 0.26, h * 0.16, shade(c, 1.14))
            x += w
        y += h
        row += 1
    if wet:
        lay = new_layer()
        d = ImageDraw.Draw(lay)
        for k in range(10):
            x = cam.x(rnd.uniform(0, W))
            d.rectangle([(x - 8) * S, GROUND_Y * S, (x + 8) * S, H * S], fill=(255, 210, 130, 70))
        soft(img, lay, blur=10)


def paint_boards(img, cam, light_c, dark_c):
    pen, x0, x1, y0, y1 = ground_plane(img, cam, light_c, dark_c, 1)
    rnd = random.Random(51)
    y, row = y0, 0
    while y < y1:
        t = (y - y0) / max(1, (H - GROUND_Y))
        h = 14 + 34 * t
        pen.rect(x0, y, x1, y + 2, shade(dark_c, 0.8))
        x = x0 + rnd.uniform(0, 200)
        while x < x1:
            pen.rect(x, y, x + 2, y + h, shade(dark_c, 0.85))
            x += rnd.uniform(160, 320)
        y += h
        row += 1


def paint_slabs(img, cam, light_c, dark_c, runner=False):
    pen, x0, x1, y0, y1 = ground_plane(img, cam, light_c, dark_c, 1)
    rnd = random.Random(61)
    y = y0
    while y < y1:
        t = (y - y0) / max(1, (H - GROUND_Y))
        h = 16 + 40 * t
        x = x0 + rnd.uniform(-60, 0)
        while x < x1:
            w = h * rnd.uniform(2.2, 3.2)
            pen.rect(x + 2, y + 2, x + w - 2, y + h - 2, shade(mix(light_c, dark_c, t), rnd.uniform(0.92, 1.08)), r=3)
            x += w
        y += h
    if runner:
        pen.rect(x0, GROUND_Y + 30, x1, GROUND_Y + 120, (168, 40, 52))
        pen.rect(x0, GROUND_Y + 34, x1, GROUND_Y + 42, (220, 180, 80))
        pen.rect(x0, GROUND_Y + 108, x1, GROUND_Y + 116, (220, 180, 80))


def paint_stage(layers, zoom, fx, ground, ground_tint=None):
    cam = Cam(zoom, fx)
    lay = new_layer()
    place = None
    for path in layers:
        name = layer_name(path)
        ENVS[name](lay, cam)
        place = PLACE[name]
    if ground:
        paint_ground(lay, cam, ground, place or 'meadow', ground_tint)
    return lay


# --- Blocks, knolls and rock faces -------------------------------------------------

def rock_face(img, points, kind='rock', seed=1, cap=True):
    """A painted rock mass filling the polygon `points` (frame pixels), with
    facets, cracks and, for snow, a snow cap along its top edge."""
    pen = Pen(img, Cam(), 1.0)
    rnd = random.Random(seed)
    base = (138, 128, 120) if kind == 'rock' else (128, 132, 146)
    pen.poly(points, base)
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in points], fill=255)
    lay = new_layer()
    lp = Pen(lay, Cam(), 1.0)
    for _ in range(int((x1 - x0) * (y1 - y0) / 5000) + 4):
        cx, cy = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(30, 90)
        a = rnd.uniform(0, 6.3)
        pts = [(cx + math.cos(a + k * 1.1) * r * rnd.uniform(0.7, 1.0), cy + math.sin(a + k * 1.1) * r * rnd.uniform(0.45, 0.7)) for k in range(6)]
        lp.poly(pts, rgba(shade(base, rnd.choice([0.8, 0.88, 1.1, 1.18])), 110))
    for k in range(int((y1 - y0) / 34) + 1):
        sy = y0 + 20 + k * 34 + rnd.uniform(-6, 6)
        lp.line([(x0, sy), (x0 + (x1 - x0) * 0.3, sy + rnd.uniform(-6, 6)), (x0 + (x1 - x0) * 0.7, sy + rnd.uniform(-6, 6)), (x1, sy)],
                rgba(shade(base, 0.7), 150), 2.5)
    for k in range(10):
        t = k / 10
        lp.rect(x0, y1 - (y1 - y0) * 0.35 * (1 - t), x1, y1, rgba((40, 34, 30), 10))
    lay = lay.filter(ImageFilter.GaussianBlur(2 * S))
    lp = Pen(lay, Cam(), 1.0)
    for _ in range(int((x1 - x0) / 110) + 2):
        cx, cy = rnd.uniform(x0, x1), rnd.uniform(y0 + 20, y1)
        lp.line([(cx, cy), (cx + rnd.uniform(-20, 20), cy + rnd.uniform(16, 50)), (cx + rnd.uniform(-30, 30), cy + rnd.uniform(40, 90))], shade(base, 0.62), 2.5)
    # light along the top edge, shade at the bottom
    for i in range(len(points)):
        a, b = points[i], points[(i + 1) % len(points)]
        if abs(a[1] - b[1]) < abs(a[0] - b[0]) * 1.5 and min(a[1], b[1]) < y1 - 4:
            lp.line([a, b], shade(base, 1.35), 7)
            lp.line([(a[0], a[1] + 8), (b[0], b[1] + 8)], rgba(shade(base, 1.15), 160), 8)
    clipped = Image.new('RGBA', img.size, (0, 0, 0, 0))
    clipped.paste(lay, (0, 0), ImageChops.multiply(mask, lay.getchannel('A')))
    img.alpha_composite(clipped)
    if kind == 'snow' and cap:
        top_edge = sorted(points, key=lambda p: p[0])
        snow = Pen(img, Cam(), 1.0)
        for i in range(len(points)):
            a, b = points[i], points[(i + 1) % len(points)]
            if abs(a[1] - b[1]) <= abs(a[0] - b[0]) * 1.5 and min(a[1], b[1]) < y1 - 4:
                th = 18
                n = max(2, int(abs(b[0] - a[0]) / 30))
                drip = []
                for k in range(n + 1):
                    t = k / n
                    drip.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + th * (0.6 + 0.4 * math.sin(k * 1.7 + seed))))
                snow.poly([(a[0] - 4, a[1] - 6), (b[0] + 4, b[1] - 6)] + list(reversed(drip)), (242, 246, 252))
                snow.line([(a[0], a[1] - 4), (b[0], b[1] - 4)], (255, 255, 255), 4)


def block(img, kind, x0, x1, top, bottom, seed=None):
    rnd = random.Random(seed if seed is not None else int(x0 * 7 + top))
    n = max(2, int((x1 - x0) / 60))
    pts = [(x0, bottom)]
    for k in range(n + 1):
        t = k / n
        pts.append((x0 + (x1 - x0) * t, top + (rnd.uniform(-6, 8) if 0 < k < n else rnd.uniform(4, 12))))
    pts.append((x1, bottom))
    rock_face(img, pts, 'snow' if kind == 'snow' else 'rock', seed=int(x0) + 3)


def knoll(img, x0, x1, top, kind='grass', place='forest'):
    """A rounded rise of ground whose crest is at `top`."""
    pen = Pen(img, Cam(), 1.0)
    w = x1 - x0
    rise = GROUND_Y + 12 - top

    def outline(lift=0.0):
        pts = [(x0 - w * 0.18, GROUND_Y + 40)]
        for k in range(41):
            t = k / 40
            x = x0 - w * 0.18 + w * 1.36 * t
            s_ = math.sin(math.pi * t) ** 0.55
            pts.append((x, GROUND_Y + 12 - rise * s_ + lift))
        pts.append((x1 + w * 0.18, GROUND_Y + 40))
        return pts
    pts = outline()
    if kind == 'snow':
        rock_face(img, pts, 'snow', seed=int(x0))
        return
    top_c = {'forest': (100, 140, 70), 'meadow': (124, 182, 88), 'enchanted': (64, 124, 116)}.get(place, (110, 160, 80))
    pen.poly(pts, shade(top_c, 0.86))
    pen.poly(outline(rise * 0.18), shade(top_c, 0.78))
    # sunlit left shoulder, fading into the slope (no hard edges)
    for k in range(6):
        pen.poly([(x, y + k * rise * 0.03) for x, y in pts[2:20]] + [(x0 + w * 0.12, GROUND_Y + 30)], rgba(shade(top_c, 1.08), 40))
    pen.line(pts[6:36], shade(top_c, 1.18), 6)
    tufts(pen, x0 - w * 0.1, x1 + w * 0.1, top + 6, GROUND_Y + 10, int(w * 0.2), [shade(top_c, 1.15), shade(top_c, 0.9)], seed=int(x0), size=(8, 18))
    for x, y in pts[2:-2:3]:
        tufts(pen, x - 6, x + 6, y, y + 3, 2, [shade(top_c, 1.22)], seed=int(x), size=(8, 16))
    blossoms(pen, x0, x1, top + 20, GROUND_Y, int(w * 0.02), seed=int(x1), size=4)


# --- Props -------------------------------------------------------------------------

class Box:
    """A prop's own canvas: u and v are fractions of its width and height,
    v = 1 at its feet. Drawing may spill a little outside the box."""

    def __init__(self, w, h, pad=0.35):
        self.w, self.h = max(1.0, w * S), max(1.0, h * S)
        self.px, self.py = int(self.w * pad) + 4, int(self.h * pad) + 4
        self.img = Image.new('RGBA', (int(self.w + 2 * self.px), int(self.h + self.py + 4)), (0, 0, 0, 0))
        self.d = _Blend(self.img)

    def p(self, u, v):
        return (self.px + u * self.w, self.py + v * self.h)

    def poly(self, pts, fill):
        self.d.polygon([self.p(u, v) for u, v in pts], fill=rgba(fill) if len(fill) == 3 else fill)

    def ellipse(self, cu, cv, ru, rv, fill):
        x, y = self.p(cu, cv)
        self.d.ellipse([x - ru * self.w, y - rv * self.h, x + ru * self.w, y + rv * self.h], fill=rgba(fill) if len(fill) == 3 else fill)

    def circle(self, cu, cv, r, fill):
        x, y = self.p(cu, cv)
        self.d.ellipse([x - r * self.w, y - r * self.w, x + r * self.w, y + r * self.w], fill=rgba(fill) if len(fill) == 3 else fill)

    def rect(self, u0, v0, u1, v1, fill, r=0):
        (a, b), (c, d) = self.p(u0, v0), self.p(u1, v1)
        if c < a or d < b:
            return
        fill = rgba(fill) if len(fill) == 3 else fill
        if r:
            self.d.rounded_rectangle([a, b, c, d], radius=min(r * self.w, (c - a) / 2, (d - b) / 2), fill=fill)
        else:
            self.d.rectangle([a, b, c, d], fill=fill)

    def line(self, pts, fill, width):
        self.d.line([self.p(u, v) for u, v in pts], fill=rgba(fill) if len(fill) == 3 else fill,
                    width=max(1, int(width * self.w)), joint='curve')

    def pen(self):
        """A world pen over this box, in prop pixels (for reusing scenery pieces):
        x in 0..w, y in 0..h (feet at h)."""
        box = self

        class _Cam(Cam):
            def x(self, x, depth=1.0):
                return (box.px + x * S) / S

            def y(self, y, depth=1.0):
                return (box.py + y * S) / S

            def z(self, depth):
                return 1.0
        return Pen(self.img, _Cam(), 1.0)


@lru_cache(maxsize=None)
def tulip_art():
    """The Undying Flower exactly as CubeBot holds it in his portrait: the
    flower is lifted from the story's own character art."""
    im = Image.open(os.path.join(STORY, 'CUBEBOT', 'CUBEBOT.png')).convert('RGBA').crop((640, 190, 776, 492))
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            flower = a and ((g > r + 25 and g > 90) or (r > 170 and g < 90 and b < 100))
            if not flower:
                px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


def prop_undying_flower(b):
    t = tulip_art()
    th = int(b.h)
    tw = int(t.width * th / t.height)
    im = t.resize((max(1, tw), max(1, th)), Image.LANCZOS)
    b.img.alpha_composite(im, (int(b.px + b.w / 2 - tw / 2), int(b.py)))


def prop_glass_dome(b):
    b.rect(0.02, 0.86, 0.98, 1.0, (120, 80, 52), r=0.06)
    b.rect(0.06, 0.82, 0.94, 0.9, (156, 106, 70), r=0.06)
    b.rect(0.06, 0.82, 0.94, 0.84, (200, 150, 100))
    t = tulip_art()
    th = int(b.h * 0.62)
    tw = int(t.width * th / t.height)
    b.img.alpha_composite(t.resize((max(1, tw), th), Image.LANCZOS), (int(b.px + b.w / 2 - tw / 2), int(b.py + b.h * 0.2)))
    glass = Image.new('RGBA', b.img.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(glass)
    (x0, y0), (x1, y1) = b.p(0.1, 0.04), b.p(0.9, 0.84)
    g.rounded_rectangle([x0, y0, x1, y1], radius=(x1 - x0) / 2, fill=(210, 236, 250, 46), outline=(236, 248, 255, 200), width=max(2, int(b.w * 0.02)))
    (a0, c0), (a1, c1) = b.p(0.2, 0.12), b.p(0.3, 0.6)
    g.rounded_rectangle([a0, c0, a1, c1], radius=(a1 - a0) / 2, fill=(255, 255, 255, 120))
    (k0, k1) = b.p(0.47, -0.02), b.p(0.53, 0.06)
    g.ellipse([k0[0], k0[1], k1[0], k1[1]], fill=(200, 230, 245, 220))
    b.img.alpha_composite(glass)


def prop_big_tree(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    broadleaf(pen, w / 2, h, h, leaf=(66, 132, 64), seed=int(w * 3), canopy=0.6)


def prop_world_tree(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    tree_with_castle(pen, w / 2, h, h)


def prop_white_tree(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    birch(pen, w / 2, h, h * 0.25, w * 0.28, seed=3, foliage=(196, 230, 228))
    leaf_mass(pen, w / 2, h * 0.2, w * 0.7, (196, 230, 228), seed=4, n=10)


def prop_bush(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    leaf_mass(pen, w * 0.3, h * 0.6, h * 0.55, (66, 132, 66), seed=1, n=8)
    leaf_mass(pen, w * 0.7, h * 0.58, h * 0.58, (72, 140, 70), seed=2, n=8)
    leaf_mass(pen, w * 0.5, h * 0.45, h * 0.6, (78, 148, 74), seed=3, n=9)
    rnd = random.Random(int(w))
    for _ in range(6):
        b.circle(rnd.uniform(0.2, 0.8), rnd.uniform(0.25, 0.7), 0.025, (250, 240, 246))


def prop_tall_grass(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    tufts(pen, w * 0.15, w * 0.85, h - 2, h, 9, [(104, 160, 72), (146, 196, 96), (84, 138, 60)], seed=int(w), size=(h * 0.4, h * 0.62))
    blossoms(pen, w * 0.25, w * 0.75, h * 0.45, h * 0.6, 2, seed=int(w) + 1, size=h * 0.05)


def prop_lamp_post(b):
    b.rect(0.3, 0.94, 0.7, 1.0, (40, 40, 48), r=0.1)
    b.rect(0.42, 0.22, 0.58, 0.95, (52, 52, 62))
    b.rect(0.42, 0.22, 0.47, 0.95, (90, 90, 104))
    b.rect(0.34, 0.2, 0.66, 0.24, (40, 40, 48))
    b.poly([(0.2, 0.08), (0.8, 0.08), (0.7, 0.2), (0.3, 0.2)], (255, 220, 140))
    b.poly([(0.5, 0.08), (0.8, 0.08), (0.7, 0.2), (0.5, 0.2)], (255, 200, 110))
    b.line([(0.2, 0.08), (0.3, 0.2)], (40, 40, 48), 0.08)
    b.line([(0.8, 0.08), (0.7, 0.2)], (40, 40, 48), 0.08)
    b.poly([(0.12, 0.08), (0.5, 0.0), (0.88, 0.08)], (40, 40, 48))
    b.circle(0.5, -0.01, 0.08, (40, 40, 48))


def prop_cloud_sea(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    rnd = random.Random(int(w))
    for k in range(9):
        cloud(pen, w * (0.05 + 0.11 * k), h * 0.8, w * rnd.uniform(0.18, 0.28), color=(250, 250, 255), shadow=(214, 222, 238), seed=k + int(w))


def prop_gate(b):
    stone = (150, 146, 160)
    b.rect(0.0, 0.05, 1.0, 1.0, stone)
    pen = b.pen()
    w, h = b.w / S, b.h / S
    stone_blocks(pen, 0, h * 0.05, w, h, stone, bw=w / 7, bh=h / 12, seed=9)
    crenels(pen, -w * 0.02, w * 1.02, h * 0.06, h * 0.07, w * 0.12, w * 0.07, stone)
    # voussoirs round the arch
    b.ellipse(0.5, 0.48, 0.36, 0.3, shade(stone, 0.75))
    b.rect(0.14, 0.48, 0.86, 1.0, shade(stone, 0.75))
    for k in range(11):
        a = math.pi + k * math.pi / 10
        b.line([(0.5 + math.cos(a) * 0.29, 0.48 + math.sin(a) * 0.24), (0.5 + math.cos(a) * 0.36, 0.48 + math.sin(a) * 0.3)], shade(stone, 0.55), 0.012)
    b.ellipse(0.5, 0.48, 0.29, 0.24, (70, 46, 34))
    b.rect(0.21, 0.48, 0.79, 1.0, (70, 46, 34))
    for k in range(6):
        u = 0.25 + k * 0.1
        b.rect(u - 0.012, 0.3, u + 0.012, 1.0, (86, 58, 40))
    for k in range(8):
        v = 0.32 + k * 0.085
        b.rect(0.21, v - 0.008, 0.79, v + 0.008, (60, 60, 70))
    for k in range(7):
        u = 0.24 + k * 0.088
        b.rect(u - 0.008, 0.26, u + 0.008, 0.98, (60, 60, 70))
        b.poly([(u - 0.014, 0.98), (u + 0.014, 0.98), (u, 1.0)], (60, 60, 70))
    b.rect(0.0, 0.94, 1.0, 1.0, shade(stone, 0.8))


def prop_city_gate(b):
    stone = (170, 164, 172)
    pen = b.pen()
    w, h = b.w / S, b.h / S
    stone_blocks(pen, 0, h * 0.08, w, h, stone, bw=w / 7, bh=h / 16, seed=4, moss=(90, 140, 80))
    crenels(pen, -w * 0.02, w * 1.02, h * 0.09, h * 0.06, w * 0.1, w * 0.06, stone)
    b.ellipse(0.5, 0.5, 0.3, 0.2, shade(stone, 0.75))
    b.rect(0.2, 0.5, 0.8, 1.0, shade(stone, 0.75))
    # the forest seen through the open archway
    view = Box(b.w / S * 0.52, b.h / S * 0.52, pad=0)
    vp = view.pen()
    vw, vh = view.w / S, view.h / S
    for i in range(12):
        vp.rect(0, vh * i / 12, vw, vh * (i + 1) / 12 + 1, mix((180, 214, 160), (130, 180, 110), i / 12))
    for k in range(5):
        broadleaf(vp, vw * (0.1 + 0.2 * k), vh * 0.86, vh * 0.7, leaf=(70, 136, 70), seed=k + 2, roots=False)
    vp.rect(0, vh * 0.85, vw, vh, (110, 160, 80))
    vp.poly([(vw * 0.4, vh * 0.85), (vw * 0.6, vh * 0.85), (vw * 0.8, vh), (vw * 0.2, vh)], (196, 176, 132))
    mask = Image.new('L', view.img.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([0, 0, view.img.width, view.img.height * 0.6], fill=255)
    md.rectangle([0, view.img.height * 0.3, view.img.width, view.img.height], fill=255)
    hole = Image.new('RGBA', view.img.size, (0, 0, 0, 0))
    hole.paste(view.img, (0, 0), mask)
    ox, oy = b.p(0.24, 0.48)
    b.img.alpha_composite(hole, (int(ox), int(oy)))
    b.poly([(0.78, 0.55), (0.98, 0.5), (0.98, 0.98), (0.78, 1.0)], (122, 80, 48))
    for k in range(4):
        b.line([(0.8 + k * 0.045, 0.54), (0.8 + k * 0.045, 0.99)], (96, 62, 38), 0.008)
    b.rect(0.8, 0.66, 0.97, 0.68, (60, 60, 70))
    b.rect(0.8, 0.86, 0.97, 0.88, (60, 60, 70))


def prop_library_facade(b):
    stone = (196, 184, 168)
    b.rect(0.0, 0.25, 1.0, 1.0, stone)
    b.poly([(-0.04, 0.27), (0.5, 0.14), (1.04, 0.27)], shade(stone, 0.9))
    b.poly([(0.06, 0.255), (0.5, 0.17), (0.94, 0.255)], shade(stone, 1.08))
    b.circle(0.5, 0.22, 0.03, (196, 160, 80))
    b.rect(-0.03, 0.26, 1.03, 0.29, shade(stone, 0.8))
    for u in (0.08, 0.26, 0.74, 0.92):
        b.rect(u - 0.045, 0.3, u + 0.045, 0.92, shade(stone, 1.1))
        b.rect(u + 0.01, 0.3, u + 0.045, 0.92, shade(stone, 0.88))
        b.rect(u - 0.06, 0.29, u + 0.06, 0.32, shade(stone, 0.95))
        b.rect(u - 0.06, 0.9, u + 0.06, 0.93, shade(stone, 0.95))
    b.ellipse(0.5, 0.62, 0.17, 0.08, (80, 56, 40))
    b.rect(0.33, 0.62, 0.67, 0.93, (80, 56, 40))
    b.rect(0.36, 0.64, 0.64, 0.93, (255, 214, 140))
    b.ellipse(0.5, 0.64, 0.14, 0.06, (255, 214, 140))
    b.poly([(0.36, 0.62), (0.28, 0.64), (0.28, 0.94), (0.36, 0.93)], (110, 70, 44))
    b.poly([(0.64, 0.62), (0.72, 0.64), (0.72, 0.94), (0.64, 0.93)], (110, 70, 44))
    b.rect(0.34, 0.45, 0.66, 0.5, (90, 64, 44), r=0.02)
    for k in range(3):
        b.rect(-0.02 - k * 0.02, 0.93 + k * 0.023, 1.02 + k * 0.02, 0.953 + k * 0.023, shade(stone, 0.92 - k * 0.05))


def prop_banner(b):
    b.rect(-0.2, 0.0, 1.2, 0.05, (110, 80, 50), r=0.02)
    b.poly([(0.0, 0.04), (1.0, 0.04), (1.0, 0.92), (0.5, 0.78), (0.0, 0.92)], (178, 40, 52))
    b.poly([(0.7, 0.04), (1.0, 0.04), (1.0, 0.92), (0.7, 0.84)], (146, 30, 42))
    b.rect(0.0, 0.08, 1.0, 0.11, (226, 186, 80))
    b.poly([(0.5, 0.25), (0.75, 0.38), (0.5, 0.58), (0.25, 0.38)], (226, 186, 80))
    b.circle(0.5, 0.4, 0.12, (178, 40, 52))
    b.circle(0.5, 0.4, 0.07, (226, 186, 80))


def prop_candle(b):
    b.ellipse(0.5, 0.95, 0.5, 0.06, (196, 160, 80))
    b.rect(0.3, 0.75, 0.7, 0.95, (196, 160, 80))
    b.rect(0.22, 0.25, 0.78, 0.8, (250, 244, 226), r=0.15)
    b.rect(0.55, 0.25, 0.78, 0.8, (226, 218, 200), r=0.12)
    b.line([(0.5, 0.25), (0.5, 0.2)], (60, 50, 40), 0.06)
    b.ellipse(0.5, 0.1, 0.22, 0.1, (255, 190, 80))
    b.ellipse(0.5, 0.12, 0.1, 0.06, (255, 248, 210))


def prop_torch(b):
    b.rect(0.3, 0.4, 0.7, 1.0, (96, 66, 44), r=0.1)
    b.rect(0.1, 0.3, 0.9, 0.46, (70, 70, 80), r=0.06)
    b.rect(0.15, 0.6, 0.85, 0.66, (70, 70, 80))


def prop_flame(b):
    b.poly([(0.1, 0.9), (0.3, 0.3), (0.5, -0.4), (0.7, 0.3), (0.9, 0.9)], (255, 140, 50))
    b.poly([(0.25, 0.9), (0.4, 0.4), (0.5, 0.0), (0.6, 0.4), (0.75, 0.9)], (255, 210, 90))
    b.ellipse(0.5, 0.75, 0.2, 0.2, (255, 250, 210))


def prop_rubble(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    rnd = random.Random(int(w))
    for k in range(9):
        x, y, s = rnd.uniform(0.1, 0.9) * w, h - rnd.uniform(0, 0.5) * h, rnd.uniform(0.15, 0.3) * w
        pen.poly([(x - s * 0.5, y), (x - s * 0.35, y - s * 0.5), (x + s * 0.2, y - s * 0.6), (x + s * 0.5, y - s * 0.15), (x + s * 0.4, y)],
                 shade((140, 130, 122), rnd.uniform(0.85, 1.1)))
        pen.poly([(x + s * 0.2, y - s * 0.6), (x + s * 0.5, y - s * 0.15), (x + s * 0.4, y), (x + s * 0.05, y)], (110, 102, 96))


def prop_dust_cloud(b):
    rnd = random.Random(int(b.w))
    for k in range(9):
        u, v, r = rnd.uniform(0.15, 0.85), rnd.uniform(0.35, 0.8), rnd.uniform(0.14, 0.24)
        b.ellipse(u, v + 0.05, r, r * 1.5, (176, 164, 150, 200))
        b.ellipse(u - 0.02, v, r * 0.9, r * 1.35, (214, 204, 190, 220))
        b.ellipse(u - 0.05, v - 0.06, r * 0.4, r * 0.5, (236, 230, 220, 200))


def prop_canopy_bed(b):
    wood = (140, 92, 62)
    pink = (226, 150, 182)
    b.rect(0.02, 0.0, 0.07, 1.0, wood)
    b.rect(0.93, 0.0, 0.98, 1.0, wood)
    b.rect(0.0, 0.0, 1.0, 0.07, pink, r=0.01)
    for k in range(10):
        b.ellipse(0.05 + k * 0.1, 0.075, 0.05, 0.03, shade(pink, 0.9))
    b.rect(0.12, 0.2, 0.88, 0.56, (176, 116, 82), r=0.04)
    b.rect(0.16, 0.24, 0.84, 0.52, (150, 98, 70), r=0.03)
    b.ellipse(0.5, 0.22, 0.12, 0.05, (176, 116, 82))
    for side in (0, 1):
        u0 = 0.07 if side == 0 else 0.8
        u1 = 0.2 if side == 0 else 0.93
        b.poly([(u0, 0.07), (u1, 0.07), (u1 - (0.05 if side == 0 else -0.05), 0.4), (u0 + (0.0 if side == 0 else 0.06), 0.9), (u0 if side == 0 else u1, 0.9)], (240, 186, 208))
        b.ellipse(0.11 if side == 0 else 0.89, 0.42, 0.04, 0.02, (220, 180, 90))
    b.rect(0.08, 0.5, 0.36, 0.6, (250, 246, 250), r=0.04)
    b.rect(0.06, 0.54, 0.94, 0.66, (248, 240, 246), r=0.02)
    b.rect(0.3, 0.54, 0.94, 0.74, (214, 150, 182), r=0.03)
    b.rect(0.3, 0.54, 0.94, 0.58, (236, 196, 214), r=0.02)
    b.rect(0.04, 0.72, 0.96, 0.88, wood, r=0.02)
    b.rect(0.04, 0.72, 0.96, 0.75, shade(wood, 1.2))
    b.rect(0.06, 0.88, 0.1, 1.0, shade(wood, 0.8))
    b.rect(0.9, 0.88, 0.94, 1.0, shade(wood, 0.8))


def prop_bed(b):
    wood = (130, 86, 58)
    b.rect(0.0, 0.0, 0.08, 1.0, wood, r=0.02)
    b.ellipse(0.04, 0.0, 0.05, 0.05, shade(wood, 1.15))
    b.rect(0.92, 0.42, 1.0, 1.0, wood, r=0.02)
    b.rect(0.06, 0.28, 0.96, 0.62, (240, 236, 232), r=0.03)
    b.rect(0.06, 0.6, 0.96, 0.82, wood)
    b.rect(0.06, 0.6, 0.96, 0.64, shade(wood, 1.2))
    b.rect(0.1, 0.82, 0.16, 1.0, shade(wood, 0.8))
    b.rect(0.84, 0.82, 0.9, 1.0, shade(wood, 0.8))


def prop_table(b):
    wood = (140, 94, 62)
    b.ellipse(0.5, 0.24, 0.52, 0.22, shade(wood, 0.8))
    b.ellipse(0.5, 0.2, 0.5, 0.2, wood)
    b.ellipse(0.46, 0.17, 0.32, 0.1, shade(wood, 1.15))
    b.rect(0.06, 0.24, 0.94, 0.42, shade(wood, 0.8))
    b.rect(0.1, 0.4, 0.17, 1.0, shade(wood, 0.72))
    b.rect(0.83, 0.4, 0.9, 1.0, shade(wood, 0.72))
    b.rect(0.42, 0.42, 0.58, 1.0, shade(wood, 0.66))


def prop_room_doorway(b):
    wood = (110, 72, 48)
    b.rect(0.0, 0.0, 0.14, 1.0, wood)
    b.rect(0.86, 0.0, 1.0, 1.0, wood)
    b.rect(0.0, 0.0, 0.05, 1.0, shade(wood, 1.2))
    b.ellipse(0.5, 0.64, 0.36, 0.04, wood)
    b.rect(0.14, 0.64, 0.86, 1.0, (24, 30, 58))
    b.ellipse(0.5, 0.64, 0.36, 0.035, (24, 30, 58))
    rnd = random.Random(3)
    for _ in range(40):
        u, v = rnd.uniform(0.16, 0.84), rnd.uniform(0.62, 0.98)
        b.line([(u, v), (u - 0.02, v + 0.02)], (140, 160, 210), 0.01)
    b.rect(0.14, 0.9, 0.86, 1.0, (40, 44, 70))
    for k in range(3):
        b.rect(0.2 + k * 0.22, 0.92, 0.3 + k * 0.22, 0.94, (255, 210, 130))


def prop_stone_pillar(b):
    stone = (180, 174, 186)
    b.rect(0.0, 0.0, 1.0, 0.06, shade(stone, 0.95))
    b.rect(0.08, 0.06, 0.92, 0.1, shade(stone, 0.85))
    b.rect(0.14, 0.1, 0.86, 0.9, stone)
    for k in range(4):
        u = 0.22 + k * 0.17
        b.rect(u, 0.1, u + 0.04, 0.9, shade(stone, 0.86))
    b.rect(0.6, 0.1, 0.86, 0.9, rgba(shade(stone, 0.6), 110))
    b.rect(0.08, 0.9, 0.92, 0.95, shade(stone, 0.85))
    b.rect(0.0, 0.95, 1.0, 1.0, shade(stone, 0.95))


def prop_thorn_vine(b):
    rnd = random.Random(int(b.w))
    for s in range(3):
        ph = rnd.uniform(0, 6)
        pts = [(t / 30, 0.5 + 0.32 * math.sin(t / 30 * 9 + ph)) for t in range(31)]
        b.line(pts, (60, 36, 64), 0.016)
        for t in range(1, 30, 3):
            u, v = pts[t]
            d = rnd.choice([-1, 1])
            b.poly([(u - 0.006, v), (u + 0.006, v), (u, v + d * 0.5)], (40, 26, 44))
        for t in range(2, 30, 6):
            u, v = pts[t]
            b.ellipse(u, v - 0.2, 0.02, 0.22, (80, 160, 120))


def prop_music_note(b):
    b.ellipse(0.32, 0.82, 0.28, 0.18, (40, 40, 50))
    b.rect(0.52, 0.06, 0.62, 0.82, (40, 40, 50))
    b.poly([(0.6, 0.06), (1.0, 0.24), (1.0, 0.42), (0.6, 0.26)], (40, 40, 50))
    b.ellipse(0.3, 0.8, 0.22, 0.13, (255, 250, 230))
    b.rect(0.55, 0.08, 0.59, 0.8, (255, 250, 230))
    b.poly([(0.6, 0.1), (0.96, 0.26), (0.96, 0.36), (0.6, 0.22)], (255, 250, 230))


def prop_house_door(b):
    b.rect(-0.1, -0.06, 1.1, 1.0, (98, 64, 42), r=0.3)
    b.rect(0.0, 0.0, 1.0, 1.0, (140, 88, 54), r=0.28)
    for k in range(3):
        b.rect(0.12 + k * 0.28, 0.08, 0.16 + k * 0.28, 1.0, (110, 70, 44))
    b.rect(0.0, 0.3, 1.0, 0.34, (60, 60, 70))
    b.rect(0.0, 0.72, 1.0, 0.76, (60, 60, 70))
    b.circle(0.82, 0.55, 0.06, (230, 196, 100))


def prop_training_dummy(b):
    b.rect(0.45, 0.4, 0.55, 1.0, (120, 84, 54))
    b.rect(0.05, 0.42, 0.95, 0.5, (120, 84, 54))
    b.rect(0.25, 0.3, 0.75, 0.72, (214, 186, 110), r=0.2)
    for k in range(5):
        b.line([(0.3, 0.36 + k * 0.07), (0.7, 0.38 + k * 0.07)], (180, 150, 80), 0.03)
    b.circle(0.5, 0.18, 0.2, (214, 186, 110))
    b.circle(0.5, 0.52, 0.12, (210, 70, 60))
    b.circle(0.5, 0.52, 0.06, (250, 240, 230))


def prop_glow_mushroom(b):
    b.ellipse(0.5, 0.45, 1.2, 0.8, (120, 255, 230, 50))
    b.rect(0.38, 0.45, 0.62, 1.0, (230, 240, 230), r=0.1)
    b.ellipse(0.5, 0.42, 0.5, 0.3, (70, 200, 200))
    b.ellipse(0.42, 0.34, 0.24, 0.12, (150, 255, 240))
    for u, v in ((0.3, 0.42), (0.6, 0.33), (0.72, 0.46)):
        b.circle(u, v, 0.06, (230, 255, 250))


def prop_glow_root(b):
    rnd = random.Random(int(b.w))
    for s in range(4):
        ph = rnd.uniform(0, 6)
        pts = [(t / 20, 0.7 + 0.25 * math.sin(t / 20 * 7 + ph)) for t in range(21)]
        b.line(pts, (60, 100, 90), 0.02)
        b.line(pts, (150, 255, 220, 140), 0.008)


def prop_mist(b):
    for k in range(8):
        b.ellipse(0.06 + k * 0.125, 0.5, 0.12, 0.6, (240, 248, 252, 120))


def prop_castle_tower(b):
    pen = b.pen()
    w, h = b.w / S, b.h / S
    round_tower(pen, w / 2, h, h * 0.18, w * 0.9, seed=5)


def prop_potted_plant(b):
    b.poly([(0.15, 0.62), (0.85, 0.62), (0.75, 1.0), (0.25, 1.0)], (190, 110, 80))
    b.rect(0.1, 0.6, 0.9, 0.68, (210, 130, 96), r=0.04)
    pen = b.pen()
    w, h = b.w / S, b.h / S
    for k, (u, v, r) in enumerate(((0.3, 0.42, 0.3), (0.7, 0.4, 0.3), (0.5, 0.25, 0.34))):
        leaf_mass(pen, w * u, h * v, w * r, (70, 150, 80), seed=k + 2, n=6)


def prop_market_stall(b):
    wood = (138, 92, 58)
    b.rect(0.06, 0.12, 0.1, 1.0, wood)
    b.rect(0.9, 0.12, 0.94, 1.0, wood)
    n = 8
    for k in range(n):
        c = (214, 64, 64) if k % 2 == 0 else (250, 244, 236)
        b.poly([(k / n, 0.12), ((k + 1) / n, 0.12), ((k + 1) / n + 0.02, 0.32), (k / n + 0.02, 0.32)], c)
        b.ellipse((k + 0.5) / n + 0.02, 0.32, 0.5 / n, 0.04, c)
    b.poly([(0.0, 0.12), (0.5, 0.0), (1.0, 0.12)], (190, 60, 60))
    b.rect(0.02, 0.6, 0.98, 0.7, shade(wood, 1.15))
    b.rect(0.04, 0.7, 0.96, 1.0, wood)
    for k in range(4):
        b.rect(0.06 + k * 0.23, 0.74, 0.24 + k * 0.23, 0.96, shade(wood, 0.82), r=0.02)
    rnd = random.Random(5)
    for k in range(18):
        u = 0.08 + (k % 9) * 0.1
        v = 0.56 - (k // 9) * 0.06
        b.circle(u, v, 0.035, rnd.choice([(230, 70, 60), (250, 170, 60), (120, 180, 70), (240, 210, 80)]))


def prop_twig(b):
    b.line([(0.0, 0.7), (0.4, 0.55), (0.7, 0.6), (1.0, 0.4)], (110, 78, 50), 0.06)
    b.line([(0.4, 0.55), (0.55, 0.15)], (110, 78, 50), 0.03)
    b.line([(0.7, 0.6), (0.85, 0.95)], (110, 78, 50), 0.025)
    b.ellipse(0.58, 0.12, 0.05, 0.14, (90, 150, 70))
    b.ellipse(0.98, 0.36, 0.05, 0.14, (90, 150, 70))


PROPS = {
    'undying-flower': prop_undying_flower, 'glass-dome': prop_glass_dome, 'big-tree': prop_big_tree,
    'world-tree': prop_world_tree, 'white-tree': prop_white_tree, 'bush': prop_bush, 'tall-grass': prop_tall_grass,
    'lamp-post': prop_lamp_post, 'cloud-sea': prop_cloud_sea, 'gate': prop_gate, 'city-gate': prop_city_gate,
    'library-facade': prop_library_facade, 'banner': prop_banner, 'candle': prop_candle, 'torch': prop_torch,
    'flame': prop_flame, 'rubble': prop_rubble, 'dust-cloud': prop_dust_cloud, 'canopy-bed': prop_canopy_bed,
    'bed': prop_bed, 'table': prop_table, 'room-doorway': prop_room_doorway, 'stone-pillar': prop_stone_pillar,
    'thorn-vine': prop_thorn_vine, 'music-note': prop_music_note, 'house-door': prop_house_door,
    'training-dummy': prop_training_dummy, 'glow-mushroom': prop_glow_mushroom, 'glow-root': prop_glow_root,
    'mist': prop_mist, 'castle-tower': prop_castle_tower, 'potted-plant': prop_potted_plant,
    'market-stall': prop_market_stall, 'twig': prop_twig,
}


def paint_prop(name, w, h):
    b = Box(w, h)
    PROPS[name](b)
    return b


def meadow_flower(w, h, color):
    """A small field flower (not the Undying Flower): stem, two leaves, a
    five-petalled head."""
    cols = {'red': (232, 84, 76), 'yellow': (250, 206, 70), 'pink': (244, 150, 196), 'blue': (120, 150, 232)}
    c = cols.get(color, (240, 240, 240))
    b = Box(w, h)
    b.line([(0.5, 1.0), (0.5, 0.32)], (66, 132, 60), 0.14)
    b.ellipse(0.32, 0.7, 0.2, 0.06, (82, 156, 70))
    b.ellipse(0.68, 0.56, 0.2, 0.06, (82, 156, 70))
    for k in range(5):
        a = k * 2 * math.pi / 5 - math.pi / 2
        b.ellipse(0.5 + math.cos(a) * 0.26, 0.22 + math.sin(a) * 0.09, 0.22, 0.08, c)
    b.circle(0.5, 0.22, 0.13, (255, 214, 100))
    return b


# --- Tiles the frames stack (shelves, barrels, crates, castle stone) ---------------

def tile_area(img, name, x0, y0, x1, y1):
    pen = Pen(img, Cam(), 1.0)
    if name == 'bookshelf':
        shelf_unit(pen, x0, x1, y0, y1, seed=int(x0) + 1)
    elif name == 'castle-block':
        stone_blocks(pen, x0, y0, x1, y1, (176, 172, 186), bw=(x1 - x0) / 18 * 1.6, bh=(y1 - y0) / 6, seed=3)
    elif name == 'barrel':
        n = max(1, int(round((x1 - x0) / (y1 - y0))))
        bw = (x1 - x0) / n
        for k in range(n):
            bx = x0 + k * bw
            pen.rect(bx + bw * 0.06, y0, bx + bw * 0.94, y1, (150, 98, 58), r=bw * 0.2)
            pen.rect(bx + bw * 0.6, y0 + 4, bx + bw * 0.88, y1 - 4, (124, 80, 48), r=bw * 0.12)
            pen.rect(bx + bw * 0.14, y0 + 6, bx + bw * 0.26, y1 - 6, (180, 126, 80), r=bw * 0.05)
            for v in (0.16, 0.84):
                pen.rect(bx + bw * 0.04, y0 + (y1 - y0) * v - 4, bx + bw * 0.96, y0 + (y1 - y0) * v + 4, (80, 80, 90))
            pen.ellipse(bx + bw / 2, y0 + 4, bw * 0.42, 6, (110, 72, 44))
    elif name == 'wood-crate':
        pen.rect(x0, y0, x1, y1, (176, 128, 76), r=4)
        pen.rect(x0, y0, x1, y0 + (y1 - y0) * 0.14, (140, 98, 58))
        pen.rect(x0, y1 - (y1 - y0) * 0.14, x1, y1, (140, 98, 58))
        pen.line([(x0 + 6, y1 - 6), (x1 - 6, y0 + 6)], (140, 98, 58), (x1 - x0) * 0.1)
        for k in range(1, 3):
            pen.line([(x0, y0 + (y1 - y0) * k / 3), (x1, y0 + (y1 - y0) * k / 3)], (150, 106, 64), 2)


def town_house(img, x0, top_tile, cols, t, seed):
    """A town house on the rooftop chase: its ridge is level with `top_tile`
    so the kid can run along it."""
    pen = Pen(img, Cam(), 1.0)
    w = cols * t
    wall_top = top_tile + t * 0.75
    house(pen, x0, GROUND_Y, w, GROUND_Y - wall_top, seed=seed, roof_h=t * 0.85)
