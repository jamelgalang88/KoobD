# The Hare and the Tortoise - scene backgrounds.
#
# One painted background for each place the story moves through, in the order
# the script visits them:
#   meadow       - the sunny meadow where the Hare boasts and the Tortoise
#                  challenges him
#   start-line   - the race's starting line, the fox on his stump ("Ready...
#                  set... GO!")
#   race-path    - the dirt track winding away over the hills ("I bolted off,
#                  my paws kicking up dust")
#   deep-woods   - halfway, in the shady woods: the thorny thicket where the
#                  Eagle is caught
#   resting-tree - the big shady oak beside the track ("A short nap doesn't
#                  hurt, right?")
#   finish-line  - the finish, the crowd cheering (every ending)
#
# The characters stand at the left and right edges in front of these, with
# the dialogue box along the bottom, so each scene keeps its subject in the
# middle. Drawn with the storyboard's illustrated scenery kit:
#     python _make_backgrounds.py
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'storyboard'))

from PIL import Image, ImageDraw  # noqa: E402

import _storyboard_paint as paint  # noqa: E402
from _storyboard_kit import (  # noqa: E402
    GROUND_Y, H, MEADOW, P, TREES, W, Frame, font, glow, grade, light, rays, sparks, vignette,
)
from _storyboard_paint import Cam, Pen, mix, rgba, shade  # noqa: E402

OUT = os.path.join(HERE, 'backgrounds')


def save(f, name):
    os.makedirs(OUT, exist_ok=True)
    f.result().resize((1920, 1080), Image.LANCZOS).save(os.path.join(OUT, f'{name}.jpg'), quality=88, optimize=True)
    print('wrote', name)


def pen_of(f):
    return Pen(f.img, Cam(), 1.0)


def meadow_stage(f, trees=True, zoom=1.0, fx=800):
    f.img.alpha_composite(paint.paint_stage(MEADOW + ([TREES] if trees else []), zoom, fx, 'grass'))


def track_curve(x_far, y_far, x_near, sway=0.0, phase=0.0, n=40):
    """A gently curving track from the horizon (x_far, y_far) to the bottom
    of the frame at x_near; `sway` bends it, more in the distance."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        y = y_far + (H + 60 - y_far) * t ** 1.7
        x = x_far + (x_near - x_far) * t + sway * math.sin(math.pi * (1 - t) ** 1.2 + phase) * (1 - t) ** 0.6
        pts.append((x, y))
    return pts


def dirt_track(pen, points, near_w, far_w, color=(206, 176, 128), seed=1):
    """A dirt track along `points` (far to near), widening toward the viewer."""
    rnd = random.Random(seed)
    n = len(points)
    left, right = [], []
    for i, (x, y) in enumerate(points):
        t = i / (n - 1)
        w = far_w + (near_w - far_w) * t ** 1.4
        if i < n - 1:
            nx, ny = points[i + 1]
        else:
            nx, ny = x + (x - points[i - 1][0]), y + (y - points[i - 1][1])
        dx, dy = nx - x, ny - y
        L = math.hypot(dx, dy) or 1
        ox, oy = -dy / L * w / 2, dx / L * w / 2
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))
    pen.poly(left + list(reversed(right)), shade(color, 0.86))
    inner = [(lx * 0.88 + rx * 0.12, ly * 0.88 + ry * 0.12) for (lx, ly), (rx, ry) in zip(left, right)]
    inner2 = [(lx * 0.12 + rx * 0.88, ly * 0.12 + ry * 0.88) for (lx, ly), (rx, ry) in zip(left, right)]
    pen.poly(inner + list(reversed(inner2)), color)
    # wheel-worn ruts and pebbles
    for k in (0.3, 0.7):
        rut = [(lx * (1 - k) + rx * k, ly * (1 - k) + ry * k) for (lx, ly), (rx, ry) in zip(left, right)]
        pen.line(rut, shade(color, 0.92), 4)
    for _ in range(60):
        i = rnd.randrange(1, n)
        t = rnd.random()
        (lx, ly), (rx, ry) = left[i], right[i]
        x, y = lx + (rx - lx) * t, ly + (ry - ly) * t
        s = 2 + 6 * i / n
        pen.ellipse(x, y, s, s * 0.6, shade(color, rnd.choice([0.75, 1.15])))
    return left, right


def bunting(pen, x0, y0, x1, y1, sag=40, colors=((232, 86, 86), (250, 204, 80), (98, 150, 230), (110, 196, 120))):
    pts = []
    for k in range(21):
        t = k / 20
        pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * math.sin(math.pi * t)))
    pen.line(pts, (90, 70, 60), 2.5)
    for k in range(1, 20, 2):
        (ax, ay), (bx, by) = pts[k], pts[k + 1]
        pen.poly([(ax, ay), (bx, by), ((ax + bx) / 2, (ay + by) / 2 + 26)], colors[(k // 2) % len(colors)])


def checkered(pen, x0, y0, x1, y1, cells=10, rows=2):
    cw, ch = (x1 - x0) / cells, (y1 - y0) / rows
    for r in range(rows):
        for c in range(cells):
            pen.rect(x0 + c * cw, y0 + r * ch, x0 + (c + 1) * cw, y0 + (r + 1) * ch,
                     (250, 248, 240) if (r + c) % 2 == 0 else (40, 40, 48))


def banner_arch(pen, f, cx, top, width, label, cloth=(214, 64, 64), seed=1):
    """Two striped posts and a banner between them, over the track."""
    x0, x1 = cx - width / 2, cx + width / 2
    for x in (x0, x1):
        pen.rect(x - 10, top - 20, x + 10, GROUND_Y + 40, (238, 236, 230))
        for k in range(8):
            y = top + k * (GROUND_Y + 40 - top) / 8
            pen.rect(x - 10, y, x + 10, y + (GROUND_Y + 40 - top) / 16, cloth)
        pen.ellipse(x, top - 24, 14, 14, (250, 204, 80))
    pen.rect(x0 + 6, top, x1 - 6, top + 86, shade(cloth, 0.8), r=8)
    pen.rect(x0 + 10, top + 4, x1 - 10, top + 82, cloth, r=6)
    checkered(pen, x0 + 10, top + 4, x1 - 10, top + 20, cells=24, rows=1)
    checkered(pen, x0 + 10, top + 66, x1 - 10, top + 82, cells=24, rows=1)
    d = ImageDraw.Draw(f.img)
    fnt = font(40, bold=True, italic=False)
    tw = d.textlength(label, font=fnt)
    d.text((P(cx) - tw / 2, P(top + 24)), label, font=fnt, fill=(255, 250, 236))


def fox_on_stump(pen, x, base):
    """The fox who starts the race, sitting up on a stump, tail raised."""
    # the stump
    pen.rect(x - 46, base - 70, x + 46, base, (128, 88, 58), r=10)
    pen.ellipse(x, base - 70, 46, 14, (196, 150, 100))
    pen.ellipse(x, base - 70, 30, 9, (176, 128, 84))
    pen.line([(x - 40, base - 40), (x - 40, base - 8)], (100, 68, 44), 3)
    fur, dark, white = (232, 122, 52), (196, 92, 36), (250, 244, 232)
    feet = base - 76
    # raised tail (the signal), white tip
    pen.line([(x + 26, feet - 20), (x + 64, feet - 70), (x + 70, feet - 140)], fur, 28)
    pen.ellipse(x + 70, feet - 150, 18, 24, white)
    # body, chest, legs
    pen.ellipse(x, feet - 46, 34, 46, fur)
    pen.ellipse(x - 6, feet - 40, 18, 32, white)
    pen.rect(x - 22, feet - 18, x - 8, feet, dark, r=5)
    pen.rect(x + 6, feet - 18, x + 20, feet, dark, r=5)
    # head, ears, snout
    hx, hy = x - 4, feet - 104
    pen.poly([(hx - 26, hy - 6), (hx - 20, hy - 46), (hx - 4, hy - 14)], fur)
    pen.poly([(hx + 26, hy - 6), (hx + 20, hy - 46), (hx + 4, hy - 14)], fur)
    pen.poly([(hx - 20, hy - 12), (hx - 18, hy - 36), (hx - 9, hy - 16)], (60, 40, 36))
    pen.poly([(hx + 20, hy - 12), (hx + 18, hy - 36), (hx + 9, hy - 16)], (60, 40, 36))
    pen.ellipse(hx, hy, 30, 26, fur)
    pen.poly([(hx - 22, hy + 6), (hx, hy + 30), (hx + 22, hy + 6)], white)
    pen.ellipse(hx, hy + 28, 6, 5, (40, 32, 30))
    pen.ellipse(hx - 11, hy - 4, 4, 5, (40, 32, 30))
    pen.ellipse(hx + 11, hy - 4, 4, 5, (40, 32, 30))
    # one paw raised to start them off
    pen.line([(x - 26, feet - 70), (x - 50, feet - 104)], fur, 12)
    pen.ellipse(x - 52, feet - 108, 9, 9, dark)


def crowd(pen, x0, x1, base, rows=2, seed=3):
    """Cheering animal spectators: rounded heads with ears, arms up."""
    rnd = random.Random(seed)
    palette = [(214, 170, 120), (170, 130, 96), (236, 220, 200), (150, 150, 160), (240, 190, 140), (196, 120, 80)]
    for r in range(rows):
        y = base - r * 46
        x = x0 + rnd.uniform(0, 20) + r * 18
        while x < x1:
            c = shade(rnd.choice(palette), 1 - 0.1 * r)
            kind = rnd.choice(['bunny', 'bear', 'bird', 'mouse'])
            pen.ellipse(x, y, 22, 30, c)
            hy = y - 40
            if kind == 'bunny':
                pen.ellipse(x - 8, hy - 30, 6, 18, c)
                pen.ellipse(x + 8, hy - 30, 6, 18, c)
            elif kind == 'bear':
                pen.ellipse(x - 13, hy - 14, 8, 8, c)
                pen.ellipse(x + 13, hy - 14, 8, 8, c)
            elif kind == 'mouse':
                pen.ellipse(x - 15, hy - 10, 10, 10, c)
                pen.ellipse(x + 15, hy - 10, 10, 10, c)
            else:
                pen.poly([(x + 14, hy), (x + 26, hy + 4), (x + 14, hy + 8)], (250, 190, 70))
            pen.ellipse(x, hy, 17, 16, c)
            pen.ellipse(x - 6, hy - 2, 2.5, 3, (40, 34, 30))
            pen.ellipse(x + 6, hy - 2, 2.5, 3, (40, 34, 30))
            if rnd.random() < 0.6:
                side = rnd.choice([-1, 1])
                pen.line([(x + side * 16, y - 14), (x + side * 30, y - 58)], c, 7)
            x += rnd.uniform(46, 62)


def bramble(pen, cx, base, w, h, seed=9):
    """A dark, thorny thicket - where the Eagle is caught."""
    rnd = random.Random(seed)
    for k in range(12):
        paint.leaf_mass(pen, cx + rnd.uniform(-0.45, 0.45) * w, base - rnd.uniform(0.15, 0.7) * h,
                        rnd.uniform(0.22, 0.32) * w, (40, 76, 48), seed=seed + k, n=8, light=(70, 116, 70))
    for k in range(7):
        ph = rnd.uniform(0, 6.3)
        x0 = cx + rnd.uniform(-0.5, 0.5) * w
        lean = rnd.uniform(-0.25, 0.25) * w
        pts = [(x0 + lean * t / 10 + math.sin(t / 2.2 + ph) * 18, base - 10 - t * h * 0.09) for t in range(11)]
        pen.line(pts, (84, 52, 44), 3)
        for i in range(1, 10, 2):
            x, y = pts[i]
            s = rnd.choice([-1, 1])
            pen.poly([(x, y - 3), (x, y + 3), (x + s * 12, y - 6)], (60, 36, 32))
    # a few feathers snagged on the thorns
    for k in range(4):
        x, y = cx + rnd.uniform(-0.3, 0.3) * w, base - rnd.uniform(0.3, 0.75) * h
        pen.ellipse(x, y, 7, 16, (120, 82, 50))
        pen.line([(x, y - 14), (x, y + 16)], (230, 220, 200), 1.5)


def confetti(pen, n, x0, y0, x1, y1, seed=1):
    rnd = random.Random(seed)
    colors = [(250, 204, 80), (240, 110, 150), (110, 180, 250), (120, 210, 140), (250, 150, 80)]
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        a = rnd.uniform(0, math.pi)
        L, w = rnd.uniform(8, 14), rnd.uniform(4, 6)
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        ox, oy = -math.sin(a) * w / 2, math.cos(a) * w / 2
        pen.poly([(x - dx - ox, y - dy - oy), (x + dx - ox, y + dy - oy), (x + dx + ox, y + dy + oy), (x - dx + ox, y - dy + oy)],
                 rnd.choice(colors))


def signpost(pen, f, x, base, label):
    pen.rect(x - 8, base - 190, x + 8, base, (128, 88, 58))
    pen.rect(x + 2, base - 190, x + 8, base, (104, 70, 46))
    pen.poly([(x - 90, base - 196), (x + 70, base - 196), (x + 100, base - 166), (x + 70, base - 136), (x - 90, base - 136)], (196, 150, 98))
    pen.poly([(x - 84, base - 190), (x + 66, base - 190), (x + 92, base - 166), (x + 66, base - 142), (x - 84, base - 142)], (222, 180, 122))
    d = ImageDraw.Draw(f.img)
    fnt = font(24, bold=True, italic=False)
    tw = d.textlength(label, font=fnt)
    d.text((P(x - 4) - tw / 2, P(base - 182)), label, font=fnt, fill=(92, 58, 34))


def butterflies(pen, spots, seed=4):
    rnd = random.Random(seed)
    for x, y in spots:
        c = rnd.choice([(250, 204, 80), (240, 150, 200), (130, 190, 250)])
        pen.ellipse(x - 7, y, 7, 9, c)
        pen.ellipse(x + 7, y, 7, 9, c)
        pen.line([(x, y - 7), (x, y + 7)], (50, 40, 40), 2)


# --- The scenes -----------------------------------------------------------------

def scene_meadow():
    f = Frame(101)
    meadow_stage(f)
    pen = pen_of(f)
    paint.pebbles(pen, 560, 1040, GROUND_Y + 30, GROUND_Y + 120, 8, (170, 164, 150), seed=7, size=(10, 20))
    signpost(pen, f, 820, GROUND_Y + 40, 'BIG RACE')
    paint.blossoms(pen, 0, W, GROUND_Y + 20, H, 90, seed=8, size=7)
    butterflies(pen, [(700, 470), (930, 420), (820, 540)])
    light(f, (255, 246, 214), 0.06)
    vignette(f, 0.22)
    save(f, 'meadow')


def scene_start_line():
    f = Frame(102)
    meadow_stage(f, trees=False)
    pen = pen_of(f)
    dirt_track(pen, track_curve(800, GROUND_Y - 6, 800), 560, 70)
    for x in (120, 1480):
        paint.broadleaf(pen, x, GROUND_Y + 10, 260, leaf=(84, 150, 72), seed=int(x), roots=False)
    bunting(pen, -20, 250, 520, 300, sag=50)
    bunting(pen, 1080, 300, 1620, 250, sag=50)
    banner_arch(pen, f, 800, 330, 560, 'START')
    fox_on_stump(pen, 1150, GROUND_Y + 60)
    paint.blossoms(pen, 0, W, GROUND_Y + 30, H, 60, seed=9, size=7)
    light(f, (255, 246, 214), 0.06)
    vignette(f, 0.24)
    save(f, 'start-line')


def scene_race_path():
    f = Frame(103)
    meadow_stage(f, trees=False)
    pen = pen_of(f)
    track = track_curve(1150, GROUND_Y - 12, 760, sway=220, phase=0.4)
    dirt_track(pen, track, 440, 30, seed=3)
    rnd = random.Random(5)
    # fence posts along the far side of the track, nearer ones bigger
    for i in range(4, 36, 4):
        x, y = track[i]
        t = i / 39
        hgt, wid = 16 + 60 * t, 3 + 7 * t
        pen.rect(x + 40 + 260 * t, y - hgt, x + 40 + 260 * t + wid, y + 2, (150, 110, 74))
    for x, h in ((140, 300), (1500, 260), (1330, 160), (300, 180)):
        paint.broadleaf(pen, x, GROUND_Y + 14, h, leaf=(80, 146, 70), seed=x, roots=False)
    # dust kicked up along the track where the Hare has just shot past
    for k in range(10):
        x, y = 860 + rnd.uniform(-160, 120), GROUND_Y + 140 + rnd.uniform(0, 140)
        r = rnd.uniform(26, 60)
        pen.ellipse(x, y, r, r * 0.7, (226, 206, 170, 150))
    for k in range(6):
        y = GROUND_Y + 150 + k * 18
        pen.line([(1000 + k * 20, y), (1180 + k * 26, y - 8)], (255, 255, 255, 170), 3)
    light(f, (255, 240, 200), 0.05)
    vignette(f, 0.24)
    save(f, 'race-path')


def scene_deep_woods():
    f = Frame(104)
    f.img.alpha_composite(paint.paint_stage([paint_bg('deep-forest')], 1.0, 800, 'grass'))
    pen = pen_of(f)
    dirt_track(pen, track_curve(790, GROUND_Y - 4, 760, sway=80), 420, 60, color=(176, 150, 112), seed=4)
    bramble(pen, 1120, GROUND_Y + 40, 460, 300)
    rays(f, (255, 236, 180), n=4, x0=300, spread=240, opacity=0.3)
    grade(f, (150, 175, 140), 0.2)
    vignette(f, 0.42)
    save(f, 'deep-woods')


def scene_resting_tree():
    f = Frame(105)
    meadow_stage(f, trees=False)
    pen = pen_of(f)
    dirt_track(pen, track_curve(1260, GROUND_Y - 8, 1230, sway=-90), 380, 50, seed=6)
    # the big shady oak, its shade pooled on the grass
    shadow = paint.new_layer()
    ImageDraw.Draw(shadow).ellipse([P(260), P(GROUND_Y + 10), P(1180), P(GROUND_Y + 150)], fill=(30, 60, 30, 110))
    paint.soft(f.img, shadow, blur=18)
    paint.broadleaf(pen, 640, GROUND_Y + 60, 720, leaf=(74, 140, 66), seed=21, canopy=0.62)
    paint.blossoms(pen, 0, W, GROUND_Y + 40, H, 70, seed=10, size=7)
    butterflies(pen, [(960, 520), (1040, 470)], seed=8)
    grade(f, (255, 214, 160), 0.18)
    vignette(f, 0.3)
    save(f, 'resting-tree')


def scene_finish_line():
    f = Frame(106)
    meadow_stage(f, trees=False)
    pen = pen_of(f)
    dirt_track(pen, track_curve(800, GROUND_Y - 6, 800), 600, 90, seed=7)
    # stands of cheering spectators either side of the track
    for x0, x1 in ((-20, 560), (1040, 1620)):
        pen.rect(x0, GROUND_Y - 110, x1, GROUND_Y + 30, (150, 104, 70))
        for k in range(3):
            pen.rect(x0, GROUND_Y - 110 + k * 46, x1, GROUND_Y - 104 + k * 46, (176, 126, 86))
        crowd(pen, x0 + 20, x1 - 20, GROUND_Y - 30, rows=3, seed=int(x0) + 50)
    bunting(pen, -20, 230, 520, 290, sag=40)
    bunting(pen, 1080, 290, 1620, 230, sag=40)
    banner_arch(pen, f, 800, 320, 520, 'FINISH', cloth=(70, 110, 200))
    # the ribbon across the line
    pen.line([(550, GROUND_Y + 10), (800, GROUND_Y + 20), (1050, GROUND_Y + 10)], (230, 60, 70), 6)
    confetti(pen, 70, 0, 40, W, 520, seed=12)
    light(f, (255, 246, 214), 0.06)
    vignette(f, 0.24)
    save(f, 'finish-line')


def paint_bg(name):
    return f'environment/backgrounds/{name}.png'


# --- Storyboard frames ------------------------------------------------------------
# Full-screen pictures shown between lines at the story's turning points:
#   eagle-trapped     - the cry for help: the Eagle caught in the thorns, the
#                       Hare stopping on the path ("I heard a loud cry...")
#   hare-frees-eagle  - he chooses to help: the Hare pulls the thorns apart and
#                       the Eagle bursts free
#   hare-sleeps       - he chooses to nap: the Hare asleep under the oak while
#                       the Tortoise plods steadily past on the track
FRAMES_OUT = os.path.join(HERE, 'frames')
CHARACTERS = os.path.join(HERE, 'characters')


def frame_on(background):
    """A frame starting from one of the scene backgrounds."""
    from _storyboard_kit import S
    f = Frame(7)
    base = Image.open(os.path.join(OUT, f'{background}.jpg')).convert('RGBA').resize((W * S, H * S), Image.LANCZOS)
    f.img.alpha_composite(base)
    return f


def place(f, name, x, feet_y, h, rot=0, flip=False, shadow=True):
    """A character standing (or lying) with its feet at (x, feet_y)."""
    from _storyboard_kit import S
    im = Image.open(os.path.join(CHARACTERS, f'{name}.png')).convert('RGBA')
    im = im.crop(im.getbbox())
    scale = h * S / im.height
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if shadow:
        lay = paint.new_layer()
        ImageDraw.Draw(lay).ellipse([P(x) - im.width * 0.4, P(feet_y) - P(10), P(x) + im.width * 0.4, P(feet_y) + P(10)], fill=(0, 0, 0, 80))
        paint.soft(f.img, lay, blur=5)
    f.img.alpha_composite(im, (P(x) - im.width // 2, P(feet_y) - im.height))
    return (P(x) - im.width // 2) / S, (P(feet_y) - im.height) / S, im.width / S, im.height / S


def thorn_vine(pen, points, width=6):
    pen.line(points, (74, 44, 38), width)
    for i in range(1, len(points) - 1):
        (ax, ay), (bx, by) = points[i - 1], points[i]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        pen.poly([(mx - 4, my), (mx + 4, my), (mx, my - 16)], (58, 34, 30))
        pen.poly([(bx - 4, by), (bx + 4, by), (bx, by + 15)], (58, 34, 30))


def zzz(f, x, y):
    d = ImageDraw.Draw(f.img)
    for k, size in enumerate((44, 60, 80)):
        fnt = font(size, bold=True, italic=True)
        tx, ty = P(x + k * 46), P(y - k * 62)
        for ox, oy in ((-3, 0), (3, 0), (0, -3), (0, 3)):
            d.text((tx + ox, ty + oy), 'Z', font=fnt, fill=(60, 70, 120))
        d.text((tx, ty), 'Z', font=fnt, fill=(255, 255, 255))


def save_frame(f, name):
    os.makedirs(FRAMES_OUT, exist_ok=True)
    f.result().resize((1920, 1080), Image.LANCZOS).save(os.path.join(FRAMES_OUT, f'{name}.jpg'), quality=88, optimize=True)
    print('wrote frame', name)


def frame_eagle_trapped():
    f = frame_on('deep-woods')
    pen = pen_of(f)
    # the Eagle caught in the thicket, wings pinned by thorny vines
    ex, ey, ew, eh = place(f, 'eagle', 1120, GROUND_Y - 40, 330, rot=-6, shadow=False)
    thorn_vine(pen, [(ex - 20, ey + eh * 0.25), (ex + ew * 0.3, ey + eh * 0.32), (ex + ew * 0.6, ey + eh * 0.2), (ex + ew + 20, ey + eh * 0.3)])
    thorn_vine(pen, [(ex + 10, ey + eh * 0.62), (ex + ew * 0.4, ey + eh * 0.52), (ex + ew * 0.75, ey + eh * 0.6), (ex + ew, ey + eh * 0.5)])
    thorn_vine(pen, [(ex + ew * 0.55, ey - 30), (ex + ew * 0.5, ey + eh * 0.4), (ex + ew * 0.6, ey + eh + 10)], width=5)
    for k in range(6):
        paint.leaf_mass(pen, ex + ew * (0.1 + 0.16 * k), ey + eh * 0.95, 34, (40, 76, 48), seed=40 + k, n=6, light=(70, 116, 70))
    # the cry: alarm marks bursting from the Eagle
    for a in (-150, -120, -90, -60, -30):
        r = math.radians(a)
        cx, cy = ex + ew * 0.45, ey + eh * 0.2
        pen.line([(cx + math.cos(r) * 150, cy + math.sin(r) * 150), (cx + math.cos(r) * 200, cy + math.sin(r) * 200)], (255, 255, 255), 7)
    # the Hare, stopped on the path, turning toward the cry
    place(f, 'hare', 430, GROUND_Y + 120, 330)
    d = ImageDraw.Draw(f.img)
    fnt = font(90, bold=True, italic=False)
    for ox, oy in ((-4, 0), (4, 0), (0, -4), (0, 4)):
        d.text((P(495 + ox / 2), P(330 + oy / 2)), '!', font=fnt, fill=(60, 50, 40))
    d.text((P(495), P(330)), '!', font=fnt, fill=(255, 220, 90))
    vignette(f, 0.35)
    save_frame(f, 'eagle-trapped')


def frame_hare_frees_eagle():
    f = frame_on('deep-woods')
    pen = pen_of(f)
    # broken vines falling away, the Eagle rising free
    for k, (x0, y0) in enumerate(((940, 520), (1240, 470), (1080, 600))):
        thorn_vine(pen, [(x0, y0), (x0 + 40, y0 + 50), (x0 + 20 + k * 10, y0 + 110)], width=5)
    place(f, 'eagle', 1180, 470, 340, rot=8, shadow=False)
    sparks(f, 40, 1000, 120, 1450, 520, color=(255, 246, 200), seed=21, size=(3, 7))
    # the Hare, paws still on the thorns he pulled apart
    place(f, 'hare', 760, GROUND_Y + 120, 380, rot=-6)
    thorn_vine(pen, [(830, 520), (900, 540), (960, 520)], width=6)
    rays(f, (255, 240, 200), n=3, x0=900, spread=200, opacity=0.4)
    vignette(f, 0.32)
    save_frame(f, 'hare-frees-eagle')


def frame_hare_sleeps():
    f = frame_on('resting-tree')
    pen = pen_of(f)
    # the Tortoise plodding steadily past on the track, small with distance
    place(f, 'tortoise', 1240, GROUND_Y + 70, 150)
    for k in range(3):
        pen.line([(1150 - k * 26, GROUND_Y + 30 + k * 10), (1110 - k * 26, GROUND_Y + 30 + k * 10)], (255, 255, 255, 190), 4)
    # the Hare asleep under the oak
    place(f, 'hare', 640, GROUND_Y + 110, 300, rot=82)
    zzz(f, 560, 560)
    grade(f, (255, 214, 160), 0.1)
    vignette(f, 0.35)
    save_frame(f, 'hare-sleeps')


if __name__ == '__main__':
    scenes = {
        'meadow': scene_meadow, 'start-line': scene_start_line, 'race-path': scene_race_path,
        'deep-woods': scene_deep_woods, 'resting-tree': scene_resting_tree, 'finish-line': scene_finish_line,
        'eagle-trapped': frame_eagle_trapped, 'hare-frees-eagle': frame_hare_frees_eagle, 'hare-sleeps': frame_hare_sleeps,
    }
    for name in (sys.argv[1:] or scenes):
        scenes[name]()
