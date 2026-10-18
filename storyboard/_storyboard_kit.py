# Drawing kit for the colour storyboard of The False Knight.
#
# Every frame is drawn on a 1600x900 design grid (supersampled S times, then
# reduced), in the flat, softly shaded style of the characters' own 2D art:
# the characters themselves are their provided portraits, posed by turning,
# tilting, cropping and mirroring them. Backgrounds, props and effects are
# drawn here.
import math
import os
import random
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
STORY = os.path.join(HERE, '..', 'src', 'The False Knight')
W, H = 1600, 900
S = 2

YELLOW = (251, 187, 59)
YELLOW_SIDE = (220, 157, 30)
BAG = (196, 148, 70)


def P(v):
    return int(round(v * S))


def pts(points):
    return [(x * S, y * S) for x, y in points]


class Frame:
    """One storyboard picture being drawn."""

    def __init__(self, seed=1):
        self.img = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 255))
        self.rnd = random.Random(seed)

    @property
    def d(self):
        return ImageDraw.Draw(self.img, 'RGBA')

    def layer(self):
        return Image.new('RGBA', self.img.size, (0, 0, 0, 0))

    def add(self, layer, blur=0, opacity=1.0):
        if blur:
            layer = layer.filter(ImageFilter.GaussianBlur(blur * S))
        if opacity < 1:
            a = layer.getchannel('A').point(lambda v: int(v * opacity))
            layer.putalpha(a)
        self.img.alpha_composite(layer)

    def result(self):
        return self.img.resize((W, H), Image.LANCZOS).convert('RGB')


# --- Basic shapes ------------------------------------------------------------------

def poly(f, points, fill, d=None):
    (d or f.d).polygon(pts(points), fill=fill)


def rect(f, x0, y0, x1, y1, fill, r=0, d=None):
    if x1 < x0 or y1 < y0:
        return
    d = d or f.d
    if r:
        d.rounded_rectangle([P(x0), P(y0), P(x1), P(y1)], radius=P(r), fill=fill)
    else:
        d.rectangle([P(x0), P(y0), P(x1), P(y1)], fill=fill)


def ellipse(f, x0, y0, x1, y1, fill, d=None):
    (d or f.d).ellipse([P(x0), P(y0), P(x1), P(y1)], fill=fill)


def line(f, points, fill, width, d=None):
    (d or f.d).line(pts(points), fill=fill, width=P(width), joint='curve')


def mix(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def shade(c, k):
    """Darker (k<1) or lighter (k>1) version of a colour."""
    if k <= 1:
        return tuple(int(v * k) for v in c[:3])
    return tuple(int(v + (255 - v) * (k - 1)) for v in c[:3])


def gradient(f, top, bottom, y0=0, y1=H, x0=0, x1=W):
    d = f.d
    for y in range(P(y0), P(y1)):
        t = (y - P(y0)) / max(1, P(y1) - P(y0))
        d.line([(P(x0), y), (P(x1), y)], fill=mix(top, bottom, t))


# --- Nature ------------------------------------------------------------------------

def clouds(f, n, y0, y1, color=(255, 255, 255), size=1.0, seed=3, opacity=0.95):
    rnd = random.Random(seed)
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        cx, cy = rnd.uniform(-50, W + 50), rnd.uniform(y0, y1)
        w = rnd.uniform(140, 300) * size
        for k in range(6):
            ox, oy = rnd.uniform(-w / 2, w / 2), rnd.uniform(-w * 0.12, w * 0.08)
            r = rnd.uniform(w * 0.18, w * 0.32)
            ellipse(f, cx + ox - r, cy + oy - r * 0.7, cx + ox + r, cy + oy + r * 0.7, color + (255,), d=d)
        rect(f, cx - w / 2, cy, cx + w / 2, cy + w * 0.12, color + (255,), r=w * 0.06, d=d)
    f.add(lay, blur=2, opacity=opacity)


def hills(f, y, amp, color, seed=1, freq=1.0, bottom=H):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6) for _ in range(3)]
    points = [(0, bottom)]
    for x in range(0, W + 21, 20):
        h = sum(math.sin(x / (260 / freq) * (k + 1) * 0.6 + ph[k]) / (k + 1) for k in range(3))
        points.append((x, y - h * amp))
    points.append((W, bottom))
    poly(f, points, color)


def grass(f, y0, y1, n, colors, seed=5, length=(14, 34), width=2.5, lean=0.0):
    """Grass blades growing up from the band y0..y1."""
    rnd = random.Random(seed)
    d = f.d
    for _ in range(n):
        x, y = rnd.uniform(-10, W + 10), rnd.uniform(y0, y1)
        L = rnd.uniform(*length) * (0.6 + 0.6 * (y - y0) / max(1, y1 - y0))
        a = -math.pi / 2 + rnd.uniform(-0.45, 0.45) + lean
        bend = rnd.uniform(-0.3, 0.3)
        c = rnd.choice(colors)
        prev = (x, y)
        for i in range(1, 5):
            t = i / 4
            cur = (x + math.cos(a + bend * t) * L * t, y + math.sin(a + bend * t) * L * t)
            line(f, [prev, cur], c, max(1, width * (1.2 - t)), d=d)
            prev = cur


def wildflowers(f, x0, y0, x1, y1, n, seed=7, size=6):
    rnd = random.Random(seed)
    d = f.d
    colors = [(230, 80, 70), (245, 150, 200), (250, 210, 80), (255, 255, 255), (175, 135, 225)]
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        s = size * (0.6 + 0.8 * (y - y0) / max(1, y1 - y0))
        c = rnd.choice(colors)
        for k in range(5):
            a = k * 2 * math.pi / 5
            ellipse(f, x + math.cos(a) * s * 0.7 - s * 0.5, y + math.sin(a) * s * 0.7 - s * 0.5,
                    x + math.cos(a) * s * 0.7 + s * 0.5, y + math.sin(a) * s * 0.7 + s * 0.5, c, d=d)
        ellipse(f, x - s * 0.35, y - s * 0.35, x + s * 0.35, y + s * 0.35, (255, 220, 120), d=d)


def bush(f, x, y, r, color=(62, 130, 64), seed=1):
    rnd = random.Random(seed)
    dark, light = shade(color, 0.72), shade(color, 1.25)
    blobs = [(x + rnd.uniform(-r, r) * 0.9, y - rnd.uniform(0.2, 0.75) * r, rnd.uniform(0.45, 0.7) * r) for _ in range(7)]
    for bx, by, br in blobs:
        ellipse(f, bx - br, by - br, bx + br, by + br, dark)
    for bx, by, br in blobs:
        ellipse(f, bx - br * 0.9, by - br, bx + br * 0.8, by + br * 0.75, color)
    for bx, by, br in blobs[:4]:
        ellipse(f, bx - br * 0.6, by - br * 0.85, bx + br * 0.1, by - br * 0.25, light)
    rect(f, x - r * 1.3, y - 4, x + r * 1.3, y + 6, dark, r=4)


def tree(f, x, base, trunk_w, height, canopy, bark=(120, 86, 58), leaf=(58, 128, 62), seed=1, roots=True, canopy_y=None):
    """A broadleaf tree: flared trunk, branches and a clustered canopy."""
    rnd = random.Random(seed)
    dark = shade(bark, 0.75)
    top = base - height
    flare = trunk_w * (1.9 if roots else 1.1)
    poly(f, [(x - flare / 2, base), (x - trunk_w / 2, base - height * 0.18), (x - trunk_w * 0.42, top),
             (x + trunk_w * 0.42, top), (x + trunk_w / 2, base - height * 0.18), (x + flare / 2, base)], bark)
    poly(f, [(x + trunk_w * 0.1, top), (x + trunk_w * 0.42, top), (x + trunk_w / 2, base - height * 0.18),
             (x + flare / 2, base), (x + trunk_w * 0.15, base)], dark)
    for k in range(3):
        bx = x + rnd.choice([-1, 1]) * trunk_w * 0.3
        line(f, [(bx, top + height * 0.25 * k), (bx + rnd.uniform(-90, 90), top - 20 + height * 0.2 * k)], bark, trunk_w * 0.18)
    cy = canopy_y if canopy_y is not None else top
    leaf_dark, leaf_light = shade(leaf, 0.72), shade(leaf, 1.22)
    blobs = [(x + rnd.uniform(-1, 1) * canopy, cy + rnd.uniform(-0.55, 0.25) * canopy, rnd.uniform(0.45, 0.68) * canopy) for _ in range(9)]
    for bx, by, br in blobs:
        ellipse(f, bx - br, by - br * 0.8, bx + br, by + br * 0.8, leaf_dark)
    for bx, by, br in blobs:
        ellipse(f, bx - br * 0.92, by - br * 0.85, bx + br * 0.8, by + br * 0.6, leaf)
    for bx, by, br in blobs[:5]:
        ellipse(f, bx - br * 0.6, by - br * 0.75, bx + br * 0.15, by - br * 0.2, leaf_light)


def pine(f, x, base, h, w, color=(48, 112, 78)):
    dark = shade(color, 0.72)
    rect(f, x - w * 0.06, base - h * 0.15, x + w * 0.06, base, (110, 78, 52))
    for k in range(4):
        y = base - h * 0.12 - k * h * 0.22
        ww = w * (1 - k * 0.2)
        poly(f, [(x - ww / 2, y), (x, y - h * 0.38), (x + ww / 2, y)], color)
        poly(f, [(x, y - h * 0.38), (x + ww / 2, y), (x + ww * 0.08, y)], dark)


def straight_trunks(f, n, color, y_top, y_bot, w=(40, 90), seed=2, light=None):
    rnd = random.Random(seed)
    for i in range(n):
        x = (i + 0.5) * W / n + rnd.uniform(-60, 60)
        ww = rnd.uniform(*w)
        rect(f, x - ww / 2, y_top, x + ww / 2, y_bot, color)
        rect(f, x + ww * 0.15, y_top, x + ww / 2, y_bot, shade(color, 0.8))
        if light:
            rect(f, x - ww / 2 + 4, y_top, x - ww / 2 + 10, y_bot, light)


def mountain(f, cx, base, peak, half, rock=(128, 138, 160), snow=True):
    dark = shade(rock, 0.8)
    poly(f, [(cx - half, base), (cx, peak), (cx + half, base)], rock)
    poly(f, [(cx, peak), (cx + half, base), (cx + half * 0.1, base)], dark)
    if snow:
        s = peak + (base - peak) * 0.27
        k = (s - peak) / (base - peak) * half
        poly(f, [(cx - k, s), (cx, peak), (cx + k, s), (cx + k * 0.5, s - 14), (cx, s + 8), (cx - k * 0.5, s - 10)], (242, 246, 252))


def rocks(f, x0, x1, y, n, color=(120, 116, 112), seed=4, size=(14, 40)):
    rnd = random.Random(seed)
    for _ in range(n):
        x, s = rnd.uniform(x0, x1), rnd.uniform(*size)
        yy = y + rnd.uniform(-6, 6)
        poly(f, [(x - s, yy), (x - s * 0.6, yy - s * 0.7), (x + s * 0.3, yy - s * 0.85), (x + s, yy - s * 0.2), (x + s * 0.8, yy)], color)
        poly(f, [(x + s * 0.3, yy - s * 0.85), (x + s, yy - s * 0.2), (x + s * 0.8, yy), (x + s * 0.1, yy)], shade(color, 0.78))


# --- Buildings -----------------------------------------------------------------------

def stone_wall(f, x0, y0, x1, y1, base=(150, 146, 160), bw=70, bh=34, seed=2):
    rnd = random.Random(seed)
    dark, light = shade(base, 0.82), shade(base, 1.08)
    rect(f, x0, y0, x1, y1, shade(base, 0.7))
    row = 0
    y = y0
    while y < y1:
        off = (bw / 2) * (row % 2)
        x = x0 - off
        while x < x1:
            c = rnd.choice([base, base, dark, light])
            rect(f, max(x0, x + 3), y + 3, min(x1, x + bw - 3), min(y1, y + bh - 3), c, r=3)
            x += bw
        y += bh
        row += 1


def crenels(f, x0, x1, y, h=40, w=50, gap=34, color=(150, 146, 160)):
    x = x0
    while x < x1:
        rect(f, x, y - h, min(x1, x + w), y + 2, color)
        rect(f, x + w * 0.7, y - h, min(x1, x + w), y + 2, shade(color, 0.85))
        x += w + gap


def arch_opening(f, cx, base, w, h, color):
    rect(f, cx - w / 2, base - h + w / 2, cx + w / 2, base, color)
    ellipse(f, cx - w / 2, base - h, cx + w / 2, base - h + w, color)


def house(f, x, base, w, h, wall=(232, 211, 168), roof=(181, 82, 59), seed=1, door=True, roof_h=None):
    rnd = random.Random(seed)
    timber = (107, 68, 38)
    rh = roof_h or w * 0.45
    if rnd.random() < 0.7:
        cx = x + w * rnd.uniform(0.6, 0.78)
        rect(f, cx, base - h - rh * 0.9, cx + w * 0.1, base - h - rh * 0.3, (141, 106, 90))
    rect(f, x, base - h, x + w, base, wall)
    rect(f, x + w * 0.82, base - h, x + w, base, shade(wall, 0.88))
    rect(f, x, base - h * 0.62, x + w, base - h * 0.58, timber)
    for k in range(4):
        tx = x + w * k / 3
        rect(f, tx - 3, base - h, tx + 3, base, timber)
    poly(f, [(x - w * 0.08, base - h + 2), (x + w / 2, base - h - rh), (x + w * 1.08, base - h + 2)], roof)
    poly(f, [(x + w / 2, base - h - rh), (x + w * 1.08, base - h + 2), (x + w / 2, base - h + 2)], shade(roof, 0.82))
    for k in range(2):
        wx = x + w * (0.2 + 0.45 * k)
        rect(f, wx, base - h * 0.88, wx + w * 0.2, base - h * 0.68, (91, 127, 168), r=2)
        rect(f, wx + w * 0.095, base - h * 0.88, wx + w * 0.105, base - h * 0.68, timber)
    if door:
        rect(f, x + w * 0.4, base - h * 0.42, x + w * 0.6, base, (122, 74, 42), r=4)


def window_lit(f, x0, y0, x1, y1, glass=(255, 214, 140), frame=(90, 62, 40)):
    rect(f, x0 - 6, y0 - 6, x1 + 6, y1 + 6, frame, r=4)
    rect(f, x0, y0, x1, y1, glass)
    rect(f, (x0 + x1) / 2 - 3, y0, (x0 + x1) / 2 + 3, y1, frame)
    rect(f, x0, (y0 + y1) / 2 - 3, x1, (y0 + y1) / 2 + 3, frame)


def bookshelf(f, x0, y0, x1, y1, seed=1, wood=(108, 70, 44)):
    rnd = random.Random(seed)
    rect(f, x0, y0, x1, y1, shade(wood, 0.8))
    books = [(150, 60, 60), (60, 90, 150), (70, 130, 80), (200, 160, 70), (120, 70, 140), (180, 110, 60), (90, 60, 50)]
    shelf_h = (y1 - y0) / 5
    for k in range(5):
        sy = y0 + k * shelf_h
        x = x0 + 8
        while x < x1 - 14:
            bw = rnd.uniform(10, 22)
            bh = shelf_h * rnd.uniform(0.62, 0.86)
            rect(f, x, sy + shelf_h - 8 - bh, min(x1 - 8, x + bw), sy + shelf_h - 8, rnd.choice(books))
            x += bw + 2
        rect(f, x0, sy + shelf_h - 8, x1, sy + shelf_h, wood)
    rect(f, x0, y0, x0 + 10, y1, wood)
    rect(f, x1 - 10, y0, x1, y1, wood)


# --- Characters --------------------------------------------------------------------

CHAR_FILES = {
    'cubebot': 'CUBEBOT/CUBEBOT.png', 'flowergirl': 'FLOWERLING/FLOWER.png', 'paperbag': 'PAPERBAG/paperbag.png',
    'oldman': 'OLD MAN/old .png', 'golem': 'GOLEM/GOLEM.png', 'twigg': 'TWIG/TWIG.png', 'water': 'WATER/WATER MAIN.png',
    'whitey': 'RAINCAR/RAINCAT.png', 'guard': 'GUARD/GUARD.png', 'headguard': 'HEAD GUARD/HEAD GUARD.png',
    'seer': 'SEER/SEER.png', 'king': 'KING/KING.png', 'doctor': 'DOCTOR/DOCTOR.png',
}


@lru_cache(maxsize=None)
def portrait(name, back=False):
    im = Image.open(os.path.join(STORY, CHAR_FILES[name])).convert('RGBA')
    px = im.load()
    w, h = im.size
    if name == 'cubebot':
        # his portrait holds a tulip; the storyboard CubeBot is empty-handed:
        # clear the flower's colours, and everything above his raised hand
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a and ((g > r + 25 and g > 90) or (r > 170 and g < 90 and b < 100) or (x >= 640 and y < 465)):
                    px[x, y] = (0, 0, 0, 0)
    if back:
        im = _back_view(name, im)
    return im.crop(im.getbbox())


def _back_view(name, im):
    """Seen from behind there is no face: find the eyes (and their soft
    edges), grow that area a little, and paint it over in the head's colour."""
    body = {'cubebot': YELLOW, 'paperbag': BAG}.get(name)
    if not body:
        return im
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = im.getbbox()
    head_bottom = y0 + (y1 - y0) * (0.40 if name == 'cubebot' else 0.47)
    mask = Image.new('L', im.size, 0)
    mp = mask.load()
    bw, bh = x1 - x0, y1 - y0
    if name == 'paperbag':
        # the bag's own colour around the eyes; anything on the face that
        # differs from it (the eye rings, pupils, highlights) is face
        samples = [px[x, int(y0 + bh * 0.30)] for x in range(int(x0 + bw * 0.4), int(x0 + bw * 0.6), 5)]
        body = tuple(sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3))
        area = (int(x0 + bw * 0.12), int(y0 + bh * 0.16), int(x1 - bw * 0.03), int(y0 + bh * 0.45))
    else:
        area = (x0, y0, x1, int(head_bottom))
    for y in range(area[1], area[3]):
        for x in range(area[0], area[2]):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            if name == 'cubebot':
                face = r < 242 and b > 42          # eye greys and their blend into yellow
            else:
                face = abs(r - body[0]) + abs(g - body[1]) + abs(b - body[2]) > 24
            if face:
                mp[x, y] = 255
    grow = 9 if name == 'cubebot' else 11
    mask = mask.filter(ImageFilter.MaxFilter(grow))
    fill = Image.new('RGBA', im.size, body + (255,))
    alpha = im.getchannel('A')
    out = Image.composite(fill, im, mask)
    out.putalpha(alpha)
    if name == 'cubebot':
        _cubebot_back_details(out, x0, y0, x1, int(head_bottom), y1)
    return out


def _cubebot_back_details(im, x0, y0, x1, head_bottom, y1):
    """CubeBot's back is not a blank block: a riveted hatch on the back of his
    head, its shadowed rim, and a vent on his back, all clipped to his outline."""
    alpha = im.getchannel('A')
    hb = alpha.crop((x0, y0, x1, head_bottom)).getbbox()
    if not hb:
        return
    hx0, hy0, hx1, hy1 = hb[0] + x0, hb[1] + y0, hb[2] + x0, hb[3] + y0
    hw, hh = hx1 - hx0, hy1 - hy0
    cx = (hx0 + hx1) / 2
    detail = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(detail)
    edge = shade(YELLOW, 0.82)
    # the head's lower rim in shadow
    d.rectangle([hx0, hy1 - hh * 0.12, hx1, hy1], fill=shade(YELLOW, 0.9) + (255,))
    # the hatch with four rivets
    px0, py0, px1, py1 = cx - hw * 0.27, hy0 + hh * 0.26, cx + hw * 0.27, hy0 + hh * 0.66
    lw = max(2, int(hw * 0.018))
    d.rounded_rectangle([px0, py0, px1, py1], radius=hw * 0.05, fill=shade(YELLOW, 0.94) + (255,), outline=edge + (255,), width=lw)
    r = hw * 0.022
    for rx in (px0 + hw * 0.05, px1 - hw * 0.05):
        for ry in (py0 + hh * 0.07, py1 - hh * 0.07):
            d.ellipse([rx - r, ry - r, rx + r, ry + r], fill=edge + (255,))
    # a vent across his back
    bh = y1 - y0
    for k in range(3):
        vy = head_bottom + bh * (0.1 + 0.055 * k)
        d.rounded_rectangle([cx - hw * 0.16, vy, cx + hw * 0.16, vy + max(3, bh * 0.016)], radius=3, fill=edge + (255,))
    detail.putalpha(ImageChops.multiply(detail.getchannel('A'), alpha))
    im.alpha_composite(detail)


MAX_UPSCALE = 1.2


def put(f, name, x, y, h, flip=False, rot=0, back=False, crop=None, anchor='feet', opacity=1.0, shadow=True, tint=None):
    """Place a character: `h` is the displayed height of the (cropped) art,
    anchored at its feet (or 'center'); `crop` is a fractional box of the art."""
    im = portrait(name, back)
    if crop:
        cw, ch = im.size
        im = im.crop((int(crop[0] * cw), int(crop[1] * ch), int(crop[2] * cw), int(crop[3] * ch)))
    h = min(h, im.height * MAX_UPSCALE)
    scale = P(h) / im.height
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if tint:
        col = Image.new('RGBA', im.size, tint[:3] + (255,))
        a = im.getchannel('A')
        im = Image.blend(im, col, tint[3] if len(tint) > 3 else 0.4)
        im.putalpha(a)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if opacity < 1:
        im.putalpha(im.getchannel('A').point(lambda v: int(v * opacity)))
    if anchor == 'feet':
        ox, oy = P(x) - im.width // 2, P(y) - im.height
    else:
        ox, oy = P(x) - im.width // 2, P(y) - im.height // 2
    if shadow and anchor == 'feet' and not rot:
        sh = f.layer()
        ImageDraw.Draw(sh).ellipse([P(x) - im.width * 0.38, P(y) - P(10), P(x) + im.width * 0.38, P(y) + P(10)], fill=(0, 0, 0, 90))
        f.add(sh, blur=4)
    f.img.alpha_composite(im, (ox, oy))
    return (ox / S, oy / S, (ox + im.width) / S, (oy + im.height) / S)


TOOL_FILES = {'hook': 'TOOLS/HOOK.png', 'rope': 'TOOLS/ROPE.png', 'gloves': 'TOOLS/gloves.png'}


@lru_cache(maxsize=None)
def tool_art(name):
    im = Image.open(os.path.join(STORY, TOOL_FILES[name])).convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())


def tool(f, name, x, y, h, rot=0, flip=False, opacity=1.0):
    """One of the Water Spirit's gifts (the provided hook, rope and gloves
    drawings), centred on (x, y), `h` tall before any turn."""
    im = tool_art(name)
    scale = P(h) / im.height
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if opacity < 1:
        im.putalpha(im.getchannel('A').point(lambda v: int(v * opacity)))
    f.img.alpha_composite(im, (P(x) - im.width // 2, P(y) - im.height // 2))


def hooded(f, x, y, h, flip=False, rot=0, cloak=(84, 64, 72)):
    """The hooded kid / thief: PaperBag under a dark travelling hood."""
    w = h * 0.8
    poly(f, [(x - w * 0.42, y - h * 0.12), (x - w * 0.3, y - h * 0.62), (x + w * 0.3, y - h * 0.62), (x + w * 0.42, y - h * 0.12)], shade(cloak, 0.8))
    box = put(f, 'paperbag', x, y, h, flip=flip, rot=rot)
    bx0, by0, bx1, by1 = box
    hw = (bx1 - bx0)
    top = by0 - h * 0.04
    poly(f, [(bx0 + hw * 0.04, top + h * 0.5), (bx0 + hw * 0.08, top + h * 0.12), (bx0 + hw * 0.3, top - h * 0.02),
             (bx1 - hw * 0.3, top - h * 0.02), (bx1 - hw * 0.08, top + h * 0.12), (bx1 - hw * 0.04, top + h * 0.5),
             (bx1 - hw * 0.16, top + h * 0.5), (bx1 - hw * 0.2, top + h * 0.16), (bx0 + hw * 0.2, top + h * 0.16),
             (bx0 + hw * 0.16, top + h * 0.5)], cloak)
    rect(f, bx0 + hw * 0.2, top + h * 0.14, bx1 - hw * 0.2, top + h * 0.2, (0, 0, 0, 70))


# --- Effects -----------------------------------------------------------------------

def rain(f, n=500, angle=0.25, color=(210, 225, 240, 140), seed=9, length=(30, 70)):
    rnd = random.Random(seed)
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        x, y, L = rnd.uniform(-100, W + 100), rnd.uniform(-50, H), rnd.uniform(*length)
        line(f, [(x, y), (x - L * angle, y + L)], color, 1.6, d=d)
    f.add(lay)


def drops(f, n, x0, y0, x1, y1, seed=3, size=10, color=(170, 210, 245)):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        poly(f, [(x, y - size), (x - size * 0.45, y), (x + size * 0.45, y)], color)
        ellipse(f, x - size * 0.45, y - size * 0.3, x + size * 0.45, y + size * 0.5, color)


def sweat(f, x, y, size=18):
    drops(f, 1, x, y, x, y, size=size, color=(150, 200, 245))


def glow(f, x, y, r, color, opacity=0.8):
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    for k in range(6, 0, -1):
        rr = r * k / 6
        ellipse(f, x - rr, y - rr, x + rr, y + rr, color[:3] + (int(60 + 30 * (6 - k)),), d=d)
    f.add(lay, blur=r * 0.25, opacity=opacity)


def sparks(f, n, x0, y0, x1, y1, color=(255, 240, 150), seed=4, size=(3, 7)):
    rnd = random.Random(seed)
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    core = f.layer()
    cd = ImageDraw.Draw(core)
    for _ in range(n):
        x, y, s = rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.uniform(*size)
        ellipse(f, x - s * 3, y - s * 3, x + s * 3, y + s * 3, color + (120,), d=d)
        ellipse(f, x - s * 0.7, y - s * 0.7, x + s * 0.7, y + s * 0.7, (255, 255, 235, 255), d=cd)
    f.add(lay, blur=6)
    f.add(core, blur=0.6)


def motion(f, x0, y0, x1, y1, n=8, color=(255, 255, 255, 170), seed=2, width=4):
    """Speed lines from (x0,y0)-(x1,y1) region, drawn horizontally."""
    rnd = random.Random(seed)
    for _ in range(n):
        y = rnd.uniform(y0, y1)
        a = rnd.uniform(x0, (x0 + x1) / 2)
        line(f, [(a, y), (a + rnd.uniform(60, x1 - x0), y)], color, width)


def dust(f, x, y, r, seed=2, color=(200, 190, 175), opacity=0.9):
    rnd = random.Random(seed)
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    for _ in range(14):
        bx, by, br = x + rnd.uniform(-r, r), y + rnd.uniform(-r * 0.6, r * 0.4), rnd.uniform(r * 0.25, r * 0.55)
        ellipse(f, bx - br, by - br, bx + br, by + br, mix(color, (255, 255, 255), rnd.uniform(0, 0.3)) + (255,), d=d)
    f.add(lay, blur=3, opacity=opacity)


def grade(f, color, amount):
    """Tint the whole picture toward a colour (time of day, mood)."""
    over = Image.new('RGBA', f.img.size, color + (255,))
    mult = ImageChops.multiply(f.img, over)
    f.img = Image.blend(f.img, mult, amount)


def light(f, color, amount):
    over = Image.new('RGBA', f.img.size, color + (int(255 * amount),))
    f.img.alpha_composite(over)


def vignette(f, strength=0.55, color=(10, 12, 20)):
    m = Image.new('L', f.img.size, 0)
    ImageDraw.Draw(m).ellipse([-P(W * 0.12), -P(H * 0.18), P(W * 1.12), P(H * 1.18)], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(P(120)))
    dark = Image.new('RGBA', f.img.size, color + (255,))
    f.img = Image.composite(f.img, dark, m.point(lambda v: int(255 * (1 - strength) + v * strength)))


def eyelids(f, opening=0.35, tilt=-14, color=(60, 60, 64)):
    """Looking out through half-closed eyes: a lens-shaped opening."""
    m = Image.new('L', f.img.size, 255)
    d = ImageDraw.Draw(m)
    cx, cy = W / 2, H / 2
    hw, hh = W * 0.62, H * opening
    up = [(cx - hw + (2 * hw) * t / 40, cy - hh * math.sin(math.pi * t / 40)) for t in range(41)]
    down = [(cx + hw - (2 * hw) * t / 40, cy + hh * math.sin(math.pi * t / 40)) for t in range(41)]
    d.polygon(pts(up + down), fill=0)
    m = m.rotate(tilt, resample=Image.BICUBIC, fillcolor=255).filter(ImageFilter.GaussianBlur(P(4)))
    lid = Image.new('RGBA', f.img.size, color + (255,))
    f.img = Image.composite(lid, f.img, m)


def font(size, bold=False, italic=False):
    names = ['georgiaz.ttf' if bold and italic else 'georgiab.ttf' if bold else 'georgiai.ttf' if italic else 'georgia.ttf', 'arial.ttf']
    for n in names:
        for folder in ('', 'C:/Windows/Fonts/'):
            try:
                return ImageFont.truetype(folder + n, P(size))
            except OSError:
                pass
    return ImageFont.load_default()


def text_center(f, text, y, size, color=(255, 255, 255), bold=True, italic=True):
    fnt = font(size, bold, italic)
    d = f.d
    w = d.textlength(text, font=fnt)
    d.text(((P(W) - w) / 2, P(y)), text, font=fnt, fill=color)



# --- Staging frames --------------------------------------------------------------
# Each frame is set in the place the script describes, painted as an
# illustration (`_storyboard_paint.py`): layered scenery, ground, and props
# sized like the story's own props - framed like a camera shot (`zoom` about the
# point `fx` on the ground line), then given depth with soft foreground foliage,
# light and grading. The frames are not screenshots of the game.

GROUND_Y = 720           # where the ground line falls in a frame (80%, as in the game)
TILE = 72                # one 16px ground tile at zoom 1 (4.5% of the width)
PROP_PX = 4.5            # frame pixels per prop pixel at zoom 1


@lru_cache(maxsize=None)
def asset(path):
    return Image.open(os.path.join(STORY, path)).convert('RGBA')


MEADOW = ['ALL (PNG)/meadow_01_sky.png', 'ALL (PNG)/meadow_02_clouds.png', 'ALL (PNG)/meadow_03_hills.png']
TREES = 'ALL (PNG)/meadow_04_trees_stones.png'


def bg(name):
    return f'environment/backgrounds/{name}.png'




def stage(f, layers, zoom=1.0, fx=W / 2, ground='grass', blur=0, ground_tint=None):
    """Paint the location (back to front) and its ground as an illustration,
    as a shot `zoom` times closer than the wide view, about `fx`."""
    from _storyboard_paint import paint_stage
    lay = paint_stage(layers, zoom, fx, ground, ground_tint)
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(P(blur)))
    f.img.alpha_composite(lay)


def block(f, kind, x0, x1, top, bottom, zoom=1.0):
    """A raised mass of rock or snow (a step, a ledge, a boulder)."""
    from _storyboard_paint import block as paint_block
    paint_block(f.img, kind, x0, x1, top, bottom)


def _place(f, im, x, feet_y, pad_x, pad_y, h, flip=False, opacity=1.0, rot=0, blur=0):
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if opacity < 1:
        im.putalpha(im.getchannel('A').point(lambda v: int(v * opacity)))
    lay = f.layer()
    # the prop's feet sit at (x, feet_y); after a rotation, keep its centre
    if rot:
        lay.alpha_composite(im, (P(x) - im.width // 2, P(feet_y) - int(h * S / 2) - im.height // 2))
    else:
        lay.alpha_composite(im, (P(x) - im.width // 2, P(feet_y) - im.height + 4))
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(P(blur)))
    f.img.alpha_composite(lay)


def gprop(f, name, x, feet_y, zoom=1.0, scale=1.0, flip=False, opacity=1.0, rot=0, blur=0):
    """A painted prop standing at (x, feet_y), the size the story's own prop
    art gives it at this zoom."""
    from _storyboard_paint import paint_prop
    ref = asset(f'environment/props/{name}.png')
    k = PROP_PX * zoom * scale
    w, h = ref.width * k, ref.height * k
    b = paint_prop(name, w, h)
    _place(f, b.img, x, feet_y, b.px, b.py, h, flip, opacity, rot, blur)
    return w, h


def gflower(f, x, feet_y, color='red', zoom=1.0, scale=1.0, rot=0):
    """A small field flower (stem, leaves and a five-petalled head)."""
    from _storyboard_paint import meadow_flower
    k = PROP_PX * zoom * scale
    b = meadow_flower(7 * k, 19 * k, color)
    _place(f, b.img, x, feet_y, b.px, b.py, 19 * k, rot=rot)


def foliage(f, side='both', color=(40, 92, 52), y=H, size=1.0, blur=8, seed=3):
    """Out-of-focus leaves at the bottom corners: depth in front of the shot."""
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    rnd = random.Random(seed)
    xs = {'left': [0], 'right': [W], 'both': [0, W]}[side]
    for cx in xs:
        for _ in range(9):
            r = rnd.uniform(90, 170) * size
            bx = cx + rnd.uniform(-60, 200) * (1 if cx == 0 else -1) * size
            by = y - rnd.uniform(0, 160) * size
            ellipse(f, bx - r, by - r * 0.75, bx + r, by + r * 0.75, shade(color, rnd.uniform(0.8, 1.15)) + (255,), d=d)
    f.add(lay, blur=blur)


def canopy_top(f, color=(36, 84, 48), blur=10, seed=5):
    """Out-of-focus leaves hanging into the top of the shot."""
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    rnd = random.Random(seed)
    for _ in range(14):
        x, r = rnd.uniform(-100, W + 100), rnd.uniform(70, 150)
        ellipse(f, x - r, -r - rnd.uniform(-40, 30), x + r, r * 0.5, shade(color, rnd.uniform(0.8, 1.2)) + (255,), d=d)
    f.add(lay, blur=blur)


def rays(f, color=(255, 236, 170), n=5, x0=200, spread=260, opacity=0.35, seed=2):
    """Light slanting down through the air."""
    rnd = random.Random(seed)
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    for k in range(n):
        x = x0 + k * spread + rnd.uniform(-40, 40)
        w = rnd.uniform(40, 90)
        poly(f, [(x, -20), (x + w, -20), (x + w + 320, H), (x + 320, H)], color + (90,), d=d)
    f.add(lay, blur=30, opacity=opacity)


def path_strip(f, x_far, x_near, w_far, w_near, y_far=GROUND_Y, color=(196, 176, 132)):
    """A dirt path running away from the camera across the ground."""
    poly(f, [(x_far - w_far / 2, y_far), (x_far + w_far / 2, y_far), (x_near + w_near / 2, H), (x_near - w_near / 2, H)], color)
    poly(f, [(x_far + w_far / 2, y_far), (x_far + w_far * 0.3, y_far), (x_near + w_near * 0.25, H), (x_near + w_near / 2, H)], shade(color, 0.9))


def water(f, x0, x1, y, depth=120, color=(110, 190, 228)):
    """Still water lying on the ground: a pool with soft ripples."""
    ellipse(f, x0, y - depth * 0.4, x1, y + depth * 0.6, shade(color, 0.85))
    ellipse(f, x0 + 30, y - depth * 0.3, x1 - 30, y + depth * 0.5, color)
    for k in range(3):
        cx, w = (x0 + x1) / 2 + (k - 1) * (x1 - x0) * 0.22, (x1 - x0) * 0.12
        line(f, [(cx - w, y + k * 12), (cx + w, y + k * 12)], (220, 244, 255), 3)


def petals(f, n, x0, y0, x1, y1, seed=6, colors=((255, 200, 220), (255, 240, 240), (250, 214, 120))):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y, r = rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.uniform(5, 9)
        a = rnd.uniform(0, math.pi)
        poly(f, [(x + math.cos(a) * r, y + math.sin(a) * r * 0.5), (x - math.sin(a) * r * 0.4, y + math.cos(a) * r * 0.4),
                 (x - math.cos(a) * r, y - math.sin(a) * r * 0.5), (x + math.sin(a) * r * 0.4, y - math.cos(a) * r * 0.4)],
             rnd.choice(colors))


def fog(f, y0, y1, color=(236, 244, 250), opacity=0.5):
    lay = f.layer()
    ImageDraw.Draw(lay).rectangle([0, P(y0), P(W), P(y1)], fill=color + (255,))
    f.add(lay, blur=40, opacity=opacity)
