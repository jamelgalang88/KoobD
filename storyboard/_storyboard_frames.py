# The colour storyboard frames 02-90, one function per frame, following the
# panels of the storyboard in "The False Knight Script.pdf" (pages 24-52).
#
# Every frame is an illustration of its panel (see `stage` in the kit and
# `_storyboard_paint.py`): the script's location painted in detail - not the
# game's tiles and sprites - with the story's characters, its props and the
# time of day the script gives. Each keeps its panel's moment and composition,
# with more of the location around it and depth (soft foreground foliage, light).
import math

from PIL import Image, ImageDraw

import _storyboard_paint as paint
from _storyboard_kit import (
    MEADOW, TREES, W, H, P, GROUND_Y, TILE, YELLOW, YELLOW_SIDE, Frame, asset, poly, rect, ellipse, line, gradient,
    clouds, put, hooded, rain, drops, sweat, glow, sparks, motion, dust, grade, light, vignette, eyelids, text_center,
    font, stage, block, gprop, gflower, foliage, canopy_top, rays, path_strip, water, petals, fog, bg, tool,
)

FOREST = [bg('deep-forest')]
ENCHANTED = [bg('enchanted-forest')]
WATER = [bg('water-forest')]
FIELD = MEADOW + [TREES]
TOWN = MEADOW + [bg('town')]
WALLS = MEADOW[:2] + [bg('castle-walls')]
PEAKS = MEADOW[:2] + [bg('mountains')]
CH = 270                 # a standing character at zoom 1, as tall as in the game
MOSS = (150, 200, 190)   # the enchanted forest's grass

# The times of day of the script, as gradings over the whole shot.
DUSK = (255, 214, 160)
NIGHT = (120, 140, 200)
RAIN = (150, 165, 190)
DAWN = (255, 210, 190)
SUNSET = (255, 180, 130)
OVERCAST = (200, 205, 214)
COLD = (200, 214, 240)
GOLD = (255, 214, 150)


def finish(f, tone=None, amount=0.25, vig=0.35):
    if tone:
        grade(f, tone, amount)
    vignette(f, vig)


# --- Shared pieces ------------------------------------------------------------------

def mound(f, x0, x1, zoom=1.0, rows=(1, 2, 1), kind='grass', place='forest'):
    """A rounded rise of ground (a knoll under a tree, a snowy crest)."""
    top = GROUND_Y - max(rows) * TILE * zoom
    paint.knoll(f.img, x0, x1, top, kind, place)
    return top


def music(f, spots, zoom=1.0):
    for x, y in spots:
        gprop(f, 'music-note', x, y, zoom, 1.6)
    glow(f, spots[0][0], spots[0][1] - 40, 90, (255, 250, 220), opacity=0.4)


def fireflies(f, n, x0, y0, x1, y1, seed=1):
    sparks(f, n, x0, y0, x1, y1, color=(255, 240, 150), seed=seed, size=(3, 6))


def cube_hand(f, x, y, s=80, rot=0, arm=None):
    """CubeBot's hand as his portrait draws it: a chunky rounded yellow block,
    a shade down one side and a few darker speckles. `arm` is where his arm
    comes from (often off the edge of the shot): a grey jointed rod, as his
    joints are drawn, meeting the hand at a round grey joint."""
    if arm:
        ax, ay = arm
        dx, dy = x - ax, y - ay
        n = math.hypot(dx, dy) or 1
        jx, jy = x - dx / n * s * 0.5, y - dy / n * s * 0.5          # the wrist joint
        line(f, [(ax, ay), (jx, jy)], (122, 120, 116), s * 0.36)
        line(f, [(ax, ay), (jx, jy)], (171, 169, 165), s * 0.26)
        line(f, [(ax - dy / n * s * 0.06, ay + dx / n * s * 0.06), (jx - dy / n * s * 0.06, jy + dx / n * s * 0.06)], (196, 194, 190), s * 0.06)
        ellipse(f, jx - s * 0.22, jy - s * 0.22, jx + s * 0.22, jy + s * 0.22, (122, 120, 116))
        ellipse(f, jx - s * 0.17, jy - s * 0.17, jx + s * 0.17, jy + s * 0.17, (171, 169, 165))
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    rect(f, x - s / 2 + s * 0.1, y - s / 2 + s * 0.1, x + s / 2 + s * 0.1, y + s / 2 + s * 0.1, YELLOW_SIDE + (255,), r=s * 0.24, d=d)
    rect(f, x - s / 2, y - s / 2, x + s / 2, y + s / 2, YELLOW + (255,), r=s * 0.24, d=d)
    # a few small worn marks, unevenly placed (a short dash, two specks)
    rect(f, x - s * 0.3, y - s * 0.3, x - s * 0.12, y - s * 0.24, (239, 168, 24, 255), r=s * 0.03, d=d)
    ellipse(f, x + s * 0.2, y + s * 0.12, x + s * 0.27, y + s * 0.18, (239, 168, 24, 255), d=d)
    ellipse(f, x - s * 0.2, y + s * 0.24, x - s * 0.15, y + s * 0.28, (239, 168, 24, 255), d=d)
    if rot:
        lay = lay.rotate(rot, center=(P(x), P(y)), resample=3)
    f.img.alpha_composite(lay)


def flower_hand(f, hx, hy, shoulder, pull, k=1.0, thumb=-1):
    """FlowerGirl's hand as her portrait draws her: a soft rounded green sleeve
    (with its lighter streaks) along a curve from `shoulder` (pulled toward
    `pull`), and a small round white hand - no fingers, a little thumb on the
    `thumb` side - coming out of its cuff."""
    sx, sy = shoulder
    kx, ky = pull
    cx, cy = hx + 2 * k, hy + 64 * k                  # the sleeve's cuff

    def tube(r, color, dx=0, dy=0, t0=0.0, t1=1.0):
        for i in range(61):
            t = t0 + (t1 - t0) * i / 60
            x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * kx + t * t * cx + dx
            y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * ky + t * t * cy + dy
            ellipse(f, x - r, y - r, x + r, y + r, color)
    tube(54 * k, (8, 150, 12))
    tube(30 * k, (11, 186, 13), dx=-12 * k, dy=-10 * k, t0=0.05, t1=0.9)
    tube(5 * k, (16, 206, 18), dx=-22 * k, dy=-24 * k, t0=0.35, t1=0.75)    # a lighter streak
    tx = hx + thumb * 59 * k
    ellipse(f, tx - 25 * k, hy - 10 * k, tx + 25 * k, hy + 40 * k, (204, 202, 200))   # her thumb
    ellipse(f, tx - 22 * k, hy - 12 * k, tx + 22 * k, hy + 34 * k, (240, 238, 236))
    ellipse(f, hx - 60 * k, hy - 68 * k, hx + 58 * k, hy + 58 * k, (204, 202, 200))   # the hand: shade
    ellipse(f, hx - 58 * k, hy - 70 * k, hx + 50 * k, hy + 48 * k, (240, 238, 236))   # and its face
    ellipse(f, hx - 38 * k, hy - 54 * k, hx - 18 * k, hy - 36 * k, (252, 252, 250))   # a soft highlight
    return cx, cy


def flower_cuff(f, cx, cy, k=1.0):
    """The sleeve's cuff, drawn over the base of her hand."""
    ellipse(f, cx - 62 * k, cy - 26 * k, cx + 62 * k, cy + 30 * k, (8, 150, 12))
    ellipse(f, cx - 50 * k, cy - 22 * k, cx + 46 * k, cy + 6 * k, (11, 186, 13))


def flower_glow(f, x, y, s=1.0):
    """The Undying Flower, glowing, as it stands on the summit in the game."""
    glow(f, x, y - 40 * s, 120 * s, (255, 245, 200), opacity=0.9)
    gprop(f, 'undying-flower', x, y, 1.0, s * 1.6)


def pendant(f, x, y, s=1.0):
    line(f, [(x - 40 * s, y - 70 * s), (x, y), (x + 40 * s, y - 70 * s)], (230, 190, 90), 3 * s)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        ellipse(f, x + math.cos(ang) * 12 * s - 11 * s, y + 14 * s + math.sin(ang) * 12 * s - 11 * s,
                x + math.cos(ang) * 12 * s + 11 * s, y + 14 * s + math.sin(ang) * 12 * s + 11 * s, (40, 40, 50))
    ellipse(f, x - 9 * s, y + 5 * s, x + 9 * s, y + 23 * s, (240, 200, 90))
    glow(f, x, y + 14 * s, 40 * s, (255, 230, 150), opacity=0.5)


def burst(f, x, y, r, color=(255, 255, 255)):
    pts_ = []
    for k in range(24):
        a = k * math.pi / 12
        rr = r if k % 2 == 0 else r * 0.5
        pts_.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    poly(f, pts_, color)


def spiral(f, x, y, r, color=(40, 40, 40), width=5):
    line(f, [(x + math.cos(t / 6) * r * t / 30, y + math.sin(t / 6) * r * t / 30) for t in range(0, 31)], color, width)


def tile_wall(f, name, x0, y_bottom, cols, rows, size):
    """Bookshelves, barrels, crates or castle stonework filling an area."""
    paint.tile_area(f.img, name, x0, y_bottom - rows * size, x0 + cols * size, y_bottom)


def house_block(f, x0, cols, rows, zoom=1.0):
    """One of the town houses from the rooftop chase; returns its roof line."""
    t = TILE * zoom
    top = GROUND_Y - rows * t
    paint.town_house(f.img, x0, top, cols, t, seed=int(x0) // 7 + cols)
    return top


def sit(f, name, x, y, h, keep=0.84, **kw):
    """A character sitting in the grass: the lower legs are hidden behind a
    tuft of tall grass, never cut off in a straight line."""
    x0, y0, x1, y1 = put(f, name, x, y, h, crop=(0, 0, 1, keep), **kw)
    w = x1 - x0
    scale = max(0.3, (w * 0.55) / (40 * 4.5))
    for k in (-0.28, 0.08, 0.36):
        gprop(f, 'tall-grass', x + k * w, y1 + 8, 1.0, scale)
    return x0, y0, x1, y1


def lying(f, name, bx0, bx1, top, head_h, cover=(150, 168, 214)):
    """Lying in bed: her head on the pillow at the bed's left end and the
    blanket laid flat along the mattress (from `bx0` to `bx1`, its top at
    `top`) up to her chin - the whole bed reads, nothing is cut in half."""
    hx = bx0 + head_h * 0.5
    # the pillow under her head
    rect(f, bx0 - head_h * 0.08, top - head_h * 0.2, bx0 + head_h * 1.0, top + head_h * 0.14, (246, 240, 246), r=head_h * 0.12)
    x0, y0, x1, y1 = put(f, name, hx, top - head_h * 0.28, head_h, crop=(0, 0, 1, 0.62), rot=90, anchor='center', shadow=False)
    # the blanket's folded edge comes up over her collar to her chin
    neck = x1 - (x1 - x0) * 0.24
    rect(f, neck, top - head_h * 0.22, bx1, top + head_h * 0.18, cover, r=head_h * 0.12)
    rect(f, neck, top - head_h * 0.44, neck + head_h * 0.24, top + head_h * 0.18, tuple(min(255, c + 34) for c in cover), r=head_h * 0.1)
    line(f, [(neck + head_h * 0.6, top - head_h * 0.14), (bx1 - head_h * 0.3, top - head_h * 0.1)], tuple(max(0, c - 34) for c in cover), max(2, head_h * 0.02))
    return x0, y0, x1, y1


def tucked_in(f, name, x, y, h, cover=(214, 160, 190)):
    """Sitting up in bed: the covers drawn up over the legs."""
    x0, y0, x1, y1 = put(f, name, x, y, h, shadow=False)
    hh = y1 - y0
    rect(f, x0 - 30, y0 + hh * 0.62, x1 + 30, y1 + 10, cover, r=16)
    rect(f, x0 - 30, y0 + hh * 0.62, x1 + 30, y0 + hh * 0.62 + 16, (246, 236, 242), r=8)
    return x0, y0, x1, y1


def room(f, name, zoom=1.0, fx=W / 2, floor='carpet', dim=0.0, blur=0):
    stage(f, [bg(name)], zoom, fx, floor, blur=blur)
    if dim:
        grade(f, (150, 140, 170), dim)


def torch_lit(f, x, y, zoom=1.0):
    gprop(f, 'torch', x, y, zoom)
    gprop(f, 'flame', x, y - 6 * 4.5 * zoom, zoom)
    glow(f, x, y - 12 * 4.5 * zoom, 50 * zoom, (255, 190, 100), opacity=0.7)


# --- The frames -----------------------------------------------------------------------
FRAMES = []


def frame(number, scene, shot, action, voice=''):
    def wrap(fn):
        FRAMES.append(dict(number=number, scene=scene, shot=shot, action=action, voice=voice, draw=fn))
        return fn
    return wrap


# Scene 1 - the grassy field (frame 01, the overhead shot, is drawn by
# _make_storyboard.py).
@frame(2, 1, 2, 'Cubebot stares at the distance.')
def f02(f):
    stage(f, MEADOW, 1.0, 800, 'grass')
    gprop(f, 'world-tree', 1180, GROUND_Y + 10, 1.0, 1.25)
    stage(f, [TREES], 1.0, 800, None)
    gprop(f, 'training-dummy', 1040, GROUND_Y, 0.8)
    put(f, 'guard', 960, GROUND_Y, 120)
    put(f, 'guard', 1110, GROUND_Y, 120, flip=True)
    put(f, 'cubebot', 430, GROUND_Y + 6, CH)
    for k, x in enumerate((90, 230, 320, 610, 760, 1450)):
        gflower(f, x, GROUND_Y + 10, ('red', 'yellow', 'pink', 'blue')[k % 4], 1.0, 1.2)
    for x in (60, 260, 520, 700, 1380, 1540):
        gprop(f, 'tall-grass', x, H + 10, 1.0, 2.4)
    foliage(f, 'both', (110, 160, 70), size=0.8, blur=10)
    light(f, (255, 240, 200), 0.06)
    finish(f, vig=0.25)


# Scene 2 - the town.
@frame(3, 2, 1, 'Cubebot bumps into a kid.', 'Kid: "Sorry!"')
def f03(f):
    stage(f, TOWN, 1.5, 760, 'grass')
    gprop(f, 'market-stall', 1300, GROUND_Y, 1.5)
    gprop(f, 'lamp-post', 300, GROUND_Y, 1.5)
    burst(f, 820, 470, 130, (255, 248, 210))
    hooded(f, 650, GROUND_Y + 10, 360, rot=-8)
    put(f, 'cubebot', 1000, GROUND_Y + 10, 400, rot=10)
    motion(f, 120, 480, 520, 700, n=7, color=(255, 255, 255, 200))
    foliage(f, 'left', (90, 70, 50), size=0.6, blur=12)
    finish(f, vig=0.3)


@frame(4, 2, 2, 'The kid runs to the rooftop.')
def f04(f):
    stage(f, TOWN, 1.0, 800, 'grass')
    house_block(f, 140, 6, 3)
    top_b = house_block(f, 640, 7, 3)
    house_block(f, 1180, 6, 2)
    hooded(f, 860, top_b - 30, 150, rot=-24)
    motion(f, 560, top_b - 170, 820, top_b - 60, n=5, color=(255, 255, 255, 200), width=3)
    put(f, 'cubebot', 1400, GROUND_Y + 6, CH * 0.95, flip=True)
    finish(f, vig=0.25)


@frame(5, 2, 3, 'Cubebot follows the kid outside the castle walls and into the forest.', 'Cubebot: "Hey, my wallet!"')
def f05(f):
    stage(f, TOWN, 1.7, 1500, 'grass')
    gprop(f, 'city-gate', 820, GROUND_Y, 1.7, 1.0)
    hooded(f, 840, GROUND_Y - 150, 70)
    # the street up to the gate: a lamp, barrels, a banner on the wall
    gprop(f, 'banner', 600, GROUND_Y - 520, 1.7, 1.1, rot=0)
    gprop(f, 'lamp-post', 1260, GROUND_Y + 10, 1.7, 0.95)
    tile_wall(f, 'barrel', 1340, GROUND_Y + 8, 2, 1, 72)
    tile_wall(f, 'wood-crate', 1376, GROUND_Y - 64, 1, 1, 72)
    for x, c in ((470, 'yellow'), (540, 'red'), (1150, 'pink')):
        gflower(f, x, GROUND_Y + 12, c, 1.7, 0.9)
    put(f, 'cubebot', 330, H + 150, 560, back=True, shadow=False)
    foliage(f, 'right', (80, 140, 70), size=0.7, blur=12)
    finish(f, vig=0.3)


@frame(6, 2, 4, 'Cubebot goes into the forest.')
def f06(f):
    stage(f, FOREST, 1.0, 800, 'grass')
    path_strip(f, 800, 820, 120, 520)
    for x, s in ((90, 1.6), (1500, 1.7)):
        gprop(f, 'big-tree', x, GROUND_Y + 20, 1.0, s)
    put(f, 'cubebot', 810, GROUND_Y + 80, CH * 1.05, back=True)
    for x in (300, 1280):
        gprop(f, 'bush', x, GROUND_Y + 40, 1.0, 1.3)
    rays(f, x0=300, opacity=0.25)
    foliage(f, 'both', (40, 96, 52), blur=10)
    finish(f, DUSK, 0.12)


@frame(7, 3, 1, 'Cubebot looks for where the thief went.')
def f07(f):
    stage(f, FOREST, 1.3, 800, 'grass')
    for x in (420, 640, 980, 1180):
        gprop(f, 'bush', x, GROUND_Y + 10, 1.3)
    put(f, 'cubebot', 800, H + 210, 640, back=True, shadow=False)
    canopy_top(f, (40, 96, 52))
    rays(f, x0=200, opacity=0.25)
    finish(f, DUSK, 0.12)


# Scene 3 - the deep forest, the song, the first meeting.
@frame(8, 3, 2, 'Cubebot follows the singing voice.', 'Someone singing')
def f08(f):
    stage(f, FOREST, 1.4, 800, 'grass')
    gprop(f, 'big-tree', 180, GROUND_Y + 40, 1.4, 1.5)
    gprop(f, 'big-tree', 1420, GROUND_Y + 40, 1.4, 1.5, flip=True)
    put(f, 'cubebot', 800, GROUND_Y + 30, CH * 1.35)
    music(f, [(1080, 300), (1170, 230), (1250, 320)], 1.4)
    foliage(f, 'both', (40, 96, 52), size=1.1, blur=12)
    finish(f, DUSK, 0.2)


@frame(9, 3, 3, 'Cubebot is fascinated by the fireflies.', 'Someone singing')
def f09(f):
    stage(f, FOREST, 1.6, 700, 'grass', blur=2)
    put(f, 'cubebot', 560, GROUND_Y + 40, CH * 1.5, rot=8)
    fireflies(f, 34, 760, 160, 1400, 640, seed=9)
    canopy_top(f, (40, 90, 50))
    finish(f, DUSK, 0.3, vig=0.45)


@frame(10, 3, 4, 'Cubebot pushes the bushes aside to find the singing voice.', 'Someone singing')
def f10(f):
    stage(f, FOREST, 2.2, 1000, 'grass', blur=6)
    glow(f, 800, 420, 320, (255, 236, 170), opacity=0.7)
    gprop(f, 'bush', 250, H + 180, 2.2, 3.0)
    gprop(f, 'bush', 1350, H + 180, 2.2, 3.0, flip=True)
    cube_hand(f, 560, 520, 170, rot=8, arm=(470, H + 60))
    cube_hand(f, 1040, 520, 170, rot=-8, arm=(1130, H + 60))
    finish(f, DUSK, 0.25, vig=0.45)


@frame(11, 3, 5, 'Cubebot sees a mysterious figure in the distance.', 'Someone singing')
def f11(f):
    stage(f, FOREST, 1.0, 800, 'grass')
    top = mound(f, 520, 1080)
    gprop(f, 'big-tree', 800, top, 1.0, 1.4)
    put(f, 'flowergirl', 820, top, 110)
    fireflies(f, 26, 600, 300, 1000, top, seed=11)
    music(f, [(890, top - 140), (930, top - 180)])
    foliage(f, 'both', (36, 88, 48), size=1.0, blur=10)
    finish(f, DUSK, 0.3)


@frame(12, 3, 6, 'FlowerGirl is fascinated by the fireflies.', 'FlowerGirl singing')
def f12(f):
    stage(f, FOREST, 2.0, 800, 'grass', blur=4)
    gprop(f, 'big-tree', 800, GROUND_Y, 2.0, 1.6, blur=3)
    put(f, 'flowergirl', 800, GROUND_Y + 40, 640, rot=-5)
    fireflies(f, 40, 200, 80, 1400, 680, seed=12)
    music(f, [(1150, 260), (1240, 190)], 1.6)
    finish(f, DUSK, 0.3, vig=0.45)


@frame(13, 3, 7, 'Guards call for FlowerGirl.', 'Head Guard: "Princess!"')
def f13(f):
    stage(f, FOREST, 1.0, 800, 'grass')
    top = mound(f, 520, 1080)
    gprop(f, 'big-tree', 800, top, 1.0, 1.4)
    put(f, 'flowergirl', 820, top, 110)
    put(f, 'guard', 1330, H + 20, 330)
    put(f, 'guard', 1520, H + 30, 330)
    put(f, 'headguard', 1180, H + 10, 360)
    foliage(f, 'left', (36, 88, 48), blur=10)
    finish(f, DUSK, 0.3)


# Scene 4 - the next day, by the stream.
@frame(14, 4, 1, 'The next day, Cubebot goes back to the spot.', 'FlowerGirl singing')
def f14(f):
    stage(f, FOREST, 1.4, 800, 'grass')
    for x in (180, 1420):
        gprop(f, 'bush', x, GROUND_Y + 40, 1.4, 1.6)
    put(f, 'cubebot', 800, GROUND_Y + 30, CH * 1.4)
    music(f, [(1180, 230), (1260, 300)], 1.4)
    rays(f, x0=100, opacity=0.25)
    finish(f, DUSK, 0.15)


@frame(15, 4, 2, 'Cubebot stares at the princess.', 'FlowerGirl singing')
def f15(f):
    stage(f, FOREST, 1.0, 800, 'grass')
    water(f, 300, 760, GROUND_Y + 50)
    gprop(f, 'big-tree', 1040, GROUND_Y, 1.0, 1.4)
    put(f, 'flowergirl', 1000, GROUND_Y, 120)
    put(f, 'cubebot', 400, H + 210, 620, back=True, shadow=False)
    foliage(f, 'right', (40, 96, 52), size=1.2, blur=10)
    finish(f, DUSK, 0.15)


@frame(16, 4, 3, 'Cubebot steps on a branch.', 'Branch breaking')
def f16(f):
    stage(f, FOREST, 3.0, 800, 'grass', blur=3)
    gprop(f, 'twig', 800, 760, 3.0, 1.6)
    burst(f, 800, 740, 110, (255, 250, 220))
    rect(f, 740, 0, 860, 420, (171, 169, 165), r=20)
    rect(f, 840, 0, 860, 420, (140, 138, 134))
    poly(f, [(560, 780), (660, 400), (940, 400), (1060, 780)], YELLOW_SIDE)
    poly(f, [(530, 750), (640, 380), (920, 380), (1020, 750)], YELLOW)
    ellipse(f, 640, 560, 700, 600, (239, 168, 24))
    for x, y in ((420, 640), (1180, 640), (340, 560), (1260, 560)):
        line(f, [(x, y), (x + (60 if x > 800 else -60), y - 40)], (255, 255, 255), 6)
    finish(f, DUSK, 0.15)


@frame(17, 4, 4, 'FlowerGirl looks at Cubebot and stops singing.')
def f17(f):
    stage(f, FOREST, 1.6, 1000, 'grass')
    gprop(f, 'big-tree', 300, GROUND_Y + 60, 1.6, 1.4)
    gprop(f, 'big-tree', 1350, GROUND_Y + 60, 1.6, 1.4, flip=True)
    put(f, 'flowergirl', 820, GROUND_Y + 20, 500)
    text_center(f, '!', 150, 90, color=(255, 255, 255))
    foliage(f, 'both', (40, 96, 52), blur=12)
    finish(f, DUSK, 0.15)


@frame(18, 4, 5, 'Cubebot is nervous.', 'Cubebot: "Your Highness... I didn\'t mean to intrude."')
def f18(f):
    stage(f, FOREST, 2.0, 800, 'grass', blur=3)
    put(f, 'cubebot', 800, GROUND_Y + 120, 640)
    for x, y in ((560, 190), (1040, 220), (590, 320), (1060, 350)):
        sweat(f, x, y, 26)
    foliage(f, 'both', (40, 96, 52), size=1.2, blur=12)
    finish(f, DUSK, 0.15)


@frame(19, 4, 6, 'Cubebot bows.')
def f19(f):
    stage(f, FOREST, 1.3, 800, 'grass')
    gprop(f, 'big-tree', 1250, GROUND_Y + 10, 1.3, 1.4)
    put(f, 'flowergirl', 1240, GROUND_Y + 10, CH * 1.2)
    put(f, 'cubebot', 640, GROUND_Y + 20, CH * 1.3, rot=-32)
    gprop(f, 'twig', 520, GROUND_Y + 20, 1.3, 1.4)
    foliage(f, 'left', (40, 96, 52), blur=10)
    finish(f, DUSK, 0.15)


@frame(20, 4, 7, 'FlowerGirl sits down.', 'FlowerGirl: "You don\'t have to kneel."')
def f20(f):
    stage(f, FOREST, 1.6, 800, 'grass')
    gprop(f, 'big-tree', 820, GROUND_Y + 20, 1.6, 1.5)
    sit(f, 'flowergirl', 780, GROUND_Y + 30, 380, keep=0.82)
    for x, c in ((540, 'pink'), (620, 'yellow'), (1010, 'pink'), (1090, 'blue')):
        gflower(f, x, GROUND_Y + 30, c, 1.6)
    fireflies(f, 12, 500, 300, 1100, 640, seed=20)
    finish(f, DUSK, 0.2)


@frame(21, 4, 8, 'FlowerGirl invites Cubebot to sit beside her.')
def f21(f):
    stage(f, FOREST, 2.0, 700, 'grass', blur=3)
    sit(f, 'flowergirl', 520, GROUND_Y + 40, 460)
    ellipse(f, 960, GROUND_Y - 10, 1180, GROUND_Y + 50, (98, 160, 76))
    for k in range(3):
        f.d.arc([P(930 - k * 30), P(560 - k * 26), P(1210 + k * 30), P(740 + k * 26)], 200, 340, fill=(255, 255, 255), width=P(4))
    gflower(f, 1260, GROUND_Y + 40, 'pink', 2.0)
    finish(f, DUSK, 0.2)


@frame(22, 4, 9, 'Cubebot sits with her.', 'Cubebot: "I was just... curious why the Princess is out here."')
def f22(f):
    stage(f, FOREST, 1.3, 800, 'grass')
    gprop(f, 'big-tree', 820, GROUND_Y + 10, 1.3, 1.6)
    sit(f, 'cubebot', 660, GROUND_Y + 20, 240, keep=0.8)
    sit(f, 'flowergirl', 960, GROUND_Y + 20, 270)
    for x, c in ((420, 'red'), (500, 'yellow'), (1180, 'pink'), (1260, 'blue')):
        gflower(f, x, GROUND_Y + 20, c, 1.3)
    fireflies(f, 22, 400, 200, 1200, 600, seed=22)
    rays(f, x0=300, opacity=0.3)
    finish(f, DUSK, 0.25)


@frame(23, 4, 10, 'FlowerGirl smiles.', 'FlowerGirl: "It\'s the only place where I can breathe."')
def f23(f):
    stage(f, FOREST, 2.4, 800, 'grass', blur=8)
    glow(f, 760, 440, 360, (255, 230, 170), opacity=0.5)
    put(f, 'flowergirl', 800, H + 10, 540, crop=(0.0, 0.0, 1.0, 0.74), shadow=False)
    fireflies(f, 22, 100, 80, 1500, 820, seed=23)
    finish(f, DUSK, 0.25, vig=0.45)


# Scene 6 - the castle at night: after the pendant, CubeBot leaves through
# her window, and FlowerGirl, alone, coughs blood (the first sign of her
# illness). Numbered after the original panels; the book files them under
# their scene.
@frame(91, 6, 1, 'Unable to answer her, CubeBot climbs out of the Princess\'s window and leaps down into the night, the pendant held tight in his hand.')
def f91(f):
    stage(f, [bg('city-night')], 1.0, 500, 'grass')
    pen = paint.Pen(f.img, paint.Cam(), 1.0)
    # the moon over the city, clear of the tower
    paint.sun_glow(f.img, 300, 150, 150, (220, 230, 255), 0.6)
    pen.ellipse(300, 150, 46, 46, (244, 244, 230))
    pen.ellipse(316, 140, 40, 40, (226, 230, 220, 120))
    # the castle's tower wall, and her lit window high in it
    stone = (112, 110, 134)
    paint.stone_blocks(pen, 860, -40, 1700, GROUND_Y + 12, stone, bw=84, bh=40, seed=91, moss=(58, 88, 72))
    pen.rect(860, -40, 884, GROUND_Y + 12, paint.shade(stone, 0.7))
    cx, top, w, h = 1190, 170, 200, 290
    paint.sun_glow(f.img, cx, top + h * 0.55, 260, (255, 200, 130), 0.75)
    pen.rect(cx - w / 2 - 22, top - 10, cx + w / 2 + 22, top + h + 18, paint.shade(stone, 0.75))
    pen.ellipse(cx, top, w / 2 + 22, 70, paint.shade(stone, 0.75))
    for k in range(16):
        t = k / 16
        pen.rect(cx - w / 2, top + h * t, cx + w / 2, top + h * (t + 1 / 16) + 1, paint.mix((255, 222, 160), (240, 170, 120), t))
    pen.ellipse(cx, top, w / 2, 56, (255, 222, 160))
    # pink curtains blowing out of the open window
    pen.poly([(cx - w / 2, top - 20), (cx - w / 2 + 40, top - 20), (cx - w / 2 - 30, top + h * 0.55), (cx - w / 2 - 80, top + h * 0.75)], (220, 120, 160))
    pen.poly([(cx + w / 2 - 40, top - 20), (cx + w / 2, top - 20), (cx + w / 2 + 10, top + h), (cx + w / 2 - 30, top + h * 0.7)], (196, 96, 140))
    pen.rect(cx - w / 2 - 34, top + h + 4, cx + w / 2 + 34, top + h + 26, paint.shade(stone, 0.9), r=4)
    # bushes along the foot of the wall
    for x in (900, 1060, 1420, 1560):
        paint.leaf_mass(pen, x, GROUND_Y - 10, 46, (40, 80, 60), seed=x, n=7)
    # CubeBot in mid-leap, down and away from the window
    motion(f, 980, 330, 1080, 420, n=5, color=(255, 255, 255, 170), width=3, seed=91)
    put(f, 'cubebot', 850, 600, 220, flip=True, rot=-16, shadow=False)
    pendant(f, 760, 430, 0.9)
    # night over the grass and the stone (the window keeps its warm light)
    lay = f.layer()
    ImageDraw.Draw(lay).rectangle([0, P(GROUND_Y - 30), P(W), P(H)], fill=(16, 22, 52, 150))
    f.add(lay, blur=20)
    grade(f, NIGHT, 0.3)
    glow(f, cx, top + h * 0.5, 150, (255, 210, 150), opacity=0.45)
    finish(f, vig=0.45)


@frame(92, 6, 2, 'FlowerGirl stands alone in her room, the window still open. Her shoulders relax - then she coughs and covers her mouth. When she pulls her hand away, there is blood.')
def f92(f):
    room(f, 'princess-room-night', 1.5, 820, 'carpet')
    pen = paint.Pen(f.img, paint.Cam(), 1.0)
    # the window he left by, its right pane swung open, a curtain drifting in
    pen.poly([(800, 40), (1040, 0), (1040, 330), (800, 300)], (34, 40, 84))
    pen.poly([(1040, 0), (1120, 30), (1120, 310), (1040, 330)], (120, 86, 60))
    pen.poly([(1050, -10), (1130, -10), (1180, 200), (1120, 420), (1090, 300)], (176, 64, 104))
    # moonlight falling through it across the floor
    lay = f.layer()
    d = ImageDraw.Draw(lay)
    d.polygon([(P(820), P(60)), (P(1040), P(20)), (P(1360), P(H)), (P(900), P(H))], fill=(190, 210, 255, 70))
    f.add(lay, blur=26)
    # the bin of crumpled tissues she hid when he came in
    rect(f, 1290, 600, 1430, 760, (200, 170, 190), r=14)
    rect(f, 1290, 600, 1430, 626, (176, 146, 168), r=8)
    for x, y, r in ((1310, 590, 26), (1350, 575, 30), (1395, 588, 27), (1330, 560, 22), (1380, 552, 22), (1430, 610, 20)):
        ellipse(f, x - r, y - r * 0.85, x + r, y + r * 0.85, (246, 244, 248))
        line(f, [(x - r * 0.5, y - r * 0.1), (x + r * 0.3, y + r * 0.2)], (210, 206, 214), 2)
    # FlowerGirl, a moment after the cough
    x0, y0, x1, y1 = put(f, 'flowergirl', 500, H + 20, 600, crop=(0, 0, 1, 0.78), shadow=False)
    bw, bh = x1 - x0, y1 - y0
    mx, my = x0 + bw * 0.36, y0 + bh * 0.66          # her mouth
    # the cough: short breaths out past her cheek, a speck of red at her lip
    for k in range(3):
        line(f, [(x0 + bw * 0.1 - k * 20, my - 40 + k * 26), (x0 + bw * 0.1 - 46 - k * 26, my - 52 + k * 30)], (255, 255, 255), 6)
    ellipse(f, mx - 6, my - 4, mx + 8, my + 10, (170, 16, 36))
    # her hand, just pulled away from her mouth and held up in front of her,
    # with the blood on it
    hx, hy = x0 + bw * 0.78, y0 + bh * 0.70
    cx, cy = flower_hand(f, hx, hy, (x0 + bw * 0.50, y1 - 60), (x0 + bw * 0.86, y1 + 40))
    for ox, oy, r in ((-8, -12, 18), (18, 4, 12), (-28, 10, 9), (14, -34, 7), (0, 20, 6)):
        ellipse(f, hx + ox - r, hy + oy - r * 0.85, hx + ox + r, hy + oy + r * 0.85, (168, 14, 34))
    ellipse(f, hx - 15, hy - 19, hx - 5, hy - 12, (222, 72, 84))
    flower_cuff(f, cx, cy)
    ellipse(f, hx + 36, hy + 26, hx + 46, hy + 40, (168, 14, 34))        # a drop running off
    glow(f, hx, hy, 120, (190, 210, 255), opacity=0.25)
    grade(f, (120, 130, 186), 0.22)
    finish(f, vig=0.55)


# Scene 8 - the hillside, the collapse, the Seer.
def hillside(f, zoom=1.0, fx=800, blur=0):
    stage(f, MEADOW, zoom, fx, 'grass', blur=blur)
    gprop(f, 'world-tree', 1380, GROUND_Y + 10, zoom * 0.8, 1.0, opacity=0.85, blur=blur)
    stage(f, [TREES], zoom, fx, None, blur=blur)


@frame(24, 8, 1, 'CubeBot and FlowerGirl sit under a tree, their usual quiet hangout spot.')
def f24(f):
    hillside(f)
    top = mound(f, 260, 980, place='meadow')
    gprop(f, 'big-tree', 560, top, 1.0, 1.6)
    sit(f, 'cubebot', 520, top + 10, 200, keep=0.8, rot=5)
    sit(f, 'flowergirl', 690, top + 10, 220)
    for x, c in ((420, 'yellow'), (860, 'red')):
        gflower(f, x, top, c)
    for x, c in ((1100, 'yellow'), (1250, 'pink'), (1400, 'red')):
        gflower(f, x, GROUND_Y, c)
    finish(f, SUNSET, 0.3, vig=0.3)


@frame(25, 8, 2, 'FlowerGirl laughs softly at something CubeBot says.', 'Laughing')
def f25(f):
    hillside(f, 2.0, 600, blur=6)
    put(f, 'flowergirl', 720, H + 20, 600, crop=(0, 0, 1, 0.75), rot=-4, shadow=False)
    motion(f, 1000, 200, 1500, 700, n=6, color=(255, 255, 255, 160), width=3)
    petals(f, 14, 1000, 150, 1500, 700, seed=25)
    finish(f, SUNSET, 0.3, vig=0.4)


@frame(26, 8, 3, 'The wind blows gently.')
def f26(f):
    hillside(f, 2.4, 700, blur=8)
    put(f, 'flowergirl', 820, H + 10, 560, crop=(0.0, 0.0, 1.0, 0.74), rot=-4, shadow=False)
    motion(f, 0, 100, 600, 800, n=9, color=(255, 255, 255, 170), width=3, seed=26)
    petals(f, 22, 0, 60, 1600, 840, seed=26)
    finish(f, SUNSET, 0.3, vig=0.4)


@frame(27, 8, 4, 'FlowerGirl sways. Her smile fades. She collapses.', 'Cubebot: "FlowerGirl?"')
def f27(f):
    hillside(f, 1.4, 700)
    gprop(f, 'big-tree', 520, GROUND_Y + 10, 1.4, 1.5)
    put(f, 'flowergirl', 900, GROUND_Y - 60, 330, rot=95, anchor='center', shadow=False)
    put(f, 'cubebot', 560, GROUND_Y + 30, CH * 1.3, rot=12)
    text_center(f, '!', 250, 80)
    finish(f, (190, 170, 200), 0.3, vig=0.45)


@frame(28, 8, 5, 'He catches her before she hits the ground. Her body is limp. Panic flashes across his glowing face.')
def f28(f):
    hillside(f, 1.1, 800)
    grade(f, RAIN, 0.5)
    put(f, 'cubebot', 820, GROUND_Y + 20, CH * 1.2)
    put(f, 'flowergirl', 840, GROUND_Y - 190, 230, rot=80, anchor='center', shadow=False)
    rain(f, 500, seed=28)
    finish(f, vig=0.45)


@frame(29, 8, 6, 'CubeBot runs toward the gates, carrying her in his arms.', 'Cubebot: "Help! Open the gates!"')
def f29(f):
    stage(f, WALLS, 1.5, 800, 'grass')
    gprop(f, 'gate', 800, GROUND_Y, 1.5, 1.4)
    for x in (560, 1040):
        torch_lit(f, x, GROUND_Y - 160, 1.5)
    put(f, 'guard', 520, GROUND_Y + 20, 300)
    put(f, 'guard', 1090, GROUND_Y + 20, 300, flip=True)
    put(f, 'cubebot', 800, H + 30, 360, back=True)
    put(f, 'flowergirl', 800, 560, 170, rot=85, anchor='center', shadow=False)
    grade(f, RAIN, 0.45)
    rain(f, 520, seed=29)
    finish(f, vig=0.45)


@frame(30, 8, 7, 'CubeBot follows as they rush into the city, to the Seer\'s house.', 'Knight: "To the seer! Quickly!"')
def f30(f):
    stage(f, [bg('city-night')], 1.6, 900, 'stone')
    gprop(f, 'lamp-post', 300, GROUND_Y, 1.6)
    glow(f, 300, GROUND_Y - 330, 90, (255, 220, 140), opacity=0.8)
    put(f, 'guard', 1100, GROUND_Y + 10, 300, flip=True)
    put(f, 'cubebot', 700, GROUND_Y + 20, 320)
    rain(f, 560, seed=30)
    finish(f, NIGHT, 0.2, vig=0.45)


def seer_room(f, zoom=1.0, fx=W / 2, blur=0):
    room(f, 'seer-house', zoom, fx, 'castle', blur=blur)
    grade(f, (200, 160, 120), 0.2)


@frame(31, 8, 8, 'The Seer places a glowing hand above her chest.')
def f31(f):
    seer_room(f, 1.4, 700)
    gprop(f, 'bed', 520, GROUND_Y, 1.4, 1.2)
    lying(f, 'flowergirl', 372, 690, 569, 78)
    put(f, 'seer', 1000, GROUND_Y + 20, 520)
    glow(f, 760, 520, 150, (120, 230, 255), opacity=0.9)
    gprop(f, 'table', 1360, GROUND_Y, 1.4)
    for x in (1310, 1410):
        gprop(f, 'candle', x, GROUND_Y - 14 * 4.5 * 1.4 * 0.5, 1.4)
        glow(f, x, GROUND_Y - 150, 50, (255, 200, 120), opacity=0.7)
    finish(f, vig=0.45)


@frame(32, 8, 9, 'FlowerGirl lies on a small bed.', 'Seer: "She carries a rare illness... one found only among the Flower Race."')
def f32(f):
    seer_room(f, 2.2, 700, blur=4)
    gprop(f, 'bed', 800, H + 100, 2.2, 1.6)
    lying(f, 'flowergirl', 455, 1165, 683, 185)
    glow(f, 900, 430, 160, (120, 230, 255), opacity=0.6)
    drops(f, 6, 400, 140, 1200, 420, seed=32, size=14)
    finish(f, vig=0.5)


@frame(33, 8, 10, 'CubeBot stands near the door, dripping rainwater. The room is silent.', 'Cubebot: "Explain."')
def f33(f):
    seer_room(f, 2.4, 800, blur=8)
    put(f, 'flowergirl', 800, H + 10, 560, crop=(0.0, 0.0, 1.0, 0.74), shadow=False)
    drops(f, 1, 600, 600, 600, 600, size=26, color=(160, 210, 250))
    grade(f, (170, 170, 200), 0.3)
    finish(f, vig=0.5)


@frame(34, 8, 11, 'Silence fills the room except for the rain. CubeBot\'s fists tighten.', 'Cubebot: "There must be a solution."')
def f34(f):
    seer_room(f, 1.6, 900)
    gprop(f, 'room-doorway', 800, H + 120, 1.6, 1.0)
    put(f, 'cubebot', 800, H + 60, 600, back=True, shadow=False)
    drops(f, 10, 500, 200, 1100, 800, seed=34, size=12)
    for x in (470, 1130):
        motion(f, x - 60, 560, x + 60, 640, n=3, color=(255, 255, 255, 200), width=3)
    finish(f, vig=0.5)


@frame(35, 8, 12, 'He turns and runs out into the storm. CubeBot runs through the empty streets.', 'Seer (quietly): "...This flower only exists in stories."')
def f35(f):
    stage(f, [bg('city-night')], 1.2, 800, 'stone')
    for x in (260, 1340):
        gprop(f, 'lamp-post', x, GROUND_Y, 1.2)
        glow(f, x, GROUND_Y - 250, 70, (255, 220, 140), opacity=0.7)
    put(f, 'cubebot', 800, H + 40, 440, back=True, rot=-6, shadow=False)
    rain(f, 620, seed=35)
    drops(f, 8, 100, 100, 1500, 800, seed=35, size=14)
    finish(f, NIGHT, 0.25, vig=0.5)


# Scene 9 - the grand library.
@frame(36, 9, 1, 'The large wooden doors burst open. CubeBot steps inside.')
def f36(f):
    stage(f, [bg('city-night')], 1.0, 300, 'stone')
    gprop(f, 'library-facade', 1180, GROUND_Y, 1.0, 1.0)
    glow(f, 1180, GROUND_Y - 100, 200, (255, 210, 130), opacity=0.7)
    gprop(f, 'lamp-post', 420, GROUND_Y, 1.0)
    glow(f, 420, GROUND_Y - 210, 60, (255, 220, 140), opacity=0.8)
    put(f, 'cubebot', 1060, GROUND_Y + 10, 230, rot=-12)
    rain(f, 300, seed=36, color=(200, 210, 230, 110))
    finish(f, NIGHT, 0.2, vig=0.45)


@frame(37, 9, 2, 'Rows and rows of ancient books tower around him. He moves quickly between the shelves, scanning titles.', 'Cubebot (to himself): "Undying Flower... Undying Flower..."')
def f37(f):
    room(f, 'library', 1.2, 800, 'stone')
    tile_wall(f, 'bookshelf', 60, GROUND_Y, 4, 5, 86)
    tile_wall(f, 'bookshelf', 1200, GROUND_Y, 4, 6, 86)
    put(f, 'cubebot', 760, GROUND_Y + 10, 300)
    rect(f, 880, 600, 980, 640, (140, 50, 50), r=6)
    gprop(f, 'candle', 560, GROUND_Y, 1.2, 1.4)
    glow(f, 560, GROUND_Y - 100, 80, (255, 210, 130), opacity=0.8)
    sparks(f, 30, 300, 100, 1300, 700, color=(255, 230, 180), seed=37, size=(1, 3))
    finish(f, (255, 210, 160), 0.15, vig=0.5)


@frame(38, 9, 3, 'CubeBot turns. An old man stands at the end of the aisle. Cloaked. Mysterious. His eyes sharp.', 'Old Man: "Searching for a legend, are you?"')
def f38(f):
    room(f, 'library', 1.6, 800, 'stone', blur=3)
    put(f, 'oldman', 820, GROUND_Y + 20, 420)
    gprop(f, 'candle', 980, GROUND_Y - 30, 1.6, 1.4)
    glow(f, 960, GROUND_Y - 180, 140, (255, 210, 130), opacity=0.7)
    tile_wall(f, 'bookshelf', -40, H + 60, 3, 9, 120)
    tile_wall(f, 'bookshelf', 1280, H + 60, 3, 9, 120)
    titles = [('ART of WAR', (150, 60, 60)), ('Harri Potah', (60, 90, 150)), ('Lord of Necklace', (70, 130, 80))]
    for k, (t, c) in enumerate(titles):
        rect(f, 10, 200 + k * 70, 330, 256 + k * 70, c, r=12)
        f.d.text((P(26), P(212 + k * 70)), t, font=font(26, italic=True), fill=(240, 228, 200))
    put(f, 'cubebot', 500, H + 60, 520, back=True, crop=(0, 0, 1, 0.55), shadow=False)
    finish(f, (255, 210, 160), 0.15, vig=0.55)


# Scene 10 - leaving at dawn; PaperBag joins.
@frame(39, 10, 1, 'The Undying Flower, as the old books picture it: the map to the highest peak.')
def f39(f):
    gradient(f, (70, 48, 36), (40, 28, 22), 0, H)
    poly(f, [(160, 160), (800, 120), (1440, 160), (1460, 820), (800, 780), (140, 820)], (226, 208, 170))
    line(f, [(800, 120), (800, 780)], (170, 150, 120), 6)
    flower_glow(f, 500, 660, 2.6)
    for k in range(6):
        line(f, [(900, 260 + k * 70), (1360, 250 + k * 70)], (150, 130, 110), 4)
    gprop(f, 'candle', 1500, 860, 2.0, 1.2)
    glow(f, 1500, 690, 120, (255, 210, 130), opacity=0.7)
    finish(f, vig=0.6)


def gates(f, zoom=1.2, fx=900):
    stage(f, WALLS, zoom, fx, 'grass')
    gprop(f, 'gate', 640, GROUND_Y, zoom, 1.2)
    for x in (380, 900):
        torch_lit(f, x, GROUND_Y - 120, zoom)
    gprop(f, 'banner', 1250, GROUND_Y - 220, zoom, 1.2)


@frame(40, 10, 2, 'The gates are closed. CubeBot pauses beneath the stone towers. A voice echoes from the shadows.', 'Voice: "Leaving without saying goodbye?"')
def f40(f):
    gates(f)
    put(f, 'paperbag', 1340, GROUND_Y + 10, 300)
    gprop(f, 'stone-pillar', 1300, GROUND_Y + 10, 1.2, 1.5)
    put(f, 'cubebot', 470, H + 60, 540, back=True, crop=(0, 0, 1, 0.6), shadow=False)
    finish(f, DAWN, 0.25)


@frame(41, 10, 3, 'From behind a pillar steps the Thief. He reveals the paper bag over his face.', 'Cubebot: "You..."')
def f41(f):
    gates(f)
    gprop(f, 'stone-pillar', 1180, GROUND_Y + 10, 1.2, 1.5)
    put(f, 'paperbag', 1360, GROUND_Y + 10, 320)
    put(f, 'cubebot', 470, H + 60, 540, back=True, crop=(0, 0, 1, 0.6), flip=True, shadow=False)
    finish(f, DAWN, 0.25)


@frame(42, 10, 4, 'CubeBot starts walking. PaperBag runs to catch up. The two walk toward the distant mountains - a new partnership formed.', 'Cubebot: "Keep up, squire."  PaperBag: "Yes, sir!"')
def f42(f):
    stage(f, PEAKS, 1.0, 800, 'grass')
    path_strip(f, 800, 820, 60, 700)
    for x in (500, 560, 1100):
        gprop(f, 'big-tree', x, GROUND_Y, 0.5)
    put(f, 'cubebot', 770, GROUND_Y + 80, 150, back=True)
    put(f, 'paperbag', 880, GROUND_Y + 70, 120, back=True)
    foliage(f, 'left', (80, 140, 70), blur=10)
    finish(f, DAWN, 0.2)


# Scene 11 - the mountain pass.
@frame(43, 11, 1, 'Cold wind howls through the narrow mountain path.')
def f43(f):
    stage(f, PEAKS, 1.0, 800, 'rock')
    block(f, 'rock', 700, 1600, GROUND_Y - 2 * TILE, GROUND_Y)
    block(f, 'rock', 1000, 1600, GROUND_Y - 4 * TILE, GROUND_Y - 2 * TILE)
    put(f, 'cubebot', 900, GROUND_Y - 2 * TILE, 150)
    put(f, 'paperbag', 790, GROUND_Y - 2 * TILE + 2, 120)
    gprop(f, 'bush', 200, GROUND_Y, 1.0)
    motion(f, 0, 150, 1600, 600, n=10, color=(255, 255, 255, 150), width=3, seed=43)
    finish(f, COLD, 0.2)


@frame(44, 11, 2, 'Loose gravel shifts beneath their feet as CubeBot and PaperBag climb the steep, rocky trail.', 'PaperBag: "You sure this is the right way?"  Cubebot: "The highest peak would not be easy to reach."')
def f44(f):
    stage(f, PEAKS, 1.3, 800, 'rock')
    ledge = GROUND_Y - TILE * 1.3
    block(f, 'rock', 0, 1600, ledge, GROUND_Y)
    put(f, 'paperbag', 700, ledge, 180, back=True)
    put(f, 'cubebot', 880, ledge, 220, back=True)
    gprop(f, 'rubble', 300, ledge, 1.3, 1.4)
    gprop(f, 'rubble', 1300, ledge, 1.3, 1.2, flip=True)
    drops(f, 10, 300, 100, 1300, 400, seed=44, size=6, color=(120, 110, 100))
    finish(f, COLD, 0.2)


@frame(45, 11, 3, 'A low rumble interrupts them. PaperBag freezes.', 'PaperBag: "Uh... do mountains normally growl?"')
def f45(f):
    stage(f, PEAKS, 2.0, 800, 'rock', blur=4)
    for x, y in ((700, 180), (840, 140), (980, 190)):
        gprop(f, 'dust-cloud', x, y, 2.0, 1.5)
    drops(f, 10, 500, 260, 1000, 460, seed=45, size=10, color=(120, 110, 100))
    put(f, 'paperbag', 580, GROUND_Y + 160, 460, rot=6)
    put(f, 'cubebot', 1000, GROUND_Y + 160, 520)
    finish(f, (210, 210, 220), 0.2, vig=0.45)


@frame(46, 11, 4, 'The ground trembles. CRACK. Rocks begin to loosen from above.', 'Cubebot: "Move!"')
def f46(f):
    stage(f, PEAKS, 1.8, 800, 'rock', blur=3)
    gprop(f, 'rubble', 640, 470, 1.8, 3.0, rot=20)
    motion(f, 380, 240, 560, 460, n=5, color=(255, 255, 255, 220))
    put(f, 'cubebot', 1060, GROUND_Y + 140, 560)
    gprop(f, 'dust-cloud', 640, 300, 1.8, 2.0)
    text_center(f, 'CRACK!', 50, 70, color=(90, 70, 60))
    finish(f, (210, 210, 220), 0.2, vig=0.45)


@frame(47, 11, 6, 'PaperBag runs, but his foot slips on loose gravel. He slides toward the edge.')
def f47(f):
    stage(f, PEAKS, 1.2, 800, None)
    paint.rock_face(f.img, [(0, 760), (W / 2, 590), (W, 420), (W, H), (0, H)], 'rock', seed=47)
    gprop(f, 'dust-cloud', 520, 560, 1.2, 2.0)
    put(f, 'paperbag', 760, 560, 360, rot=-30, anchor='center', shadow=False)
    drops(f, 6, 300, 700, 600, 840, seed=47, size=10, color=(120, 110, 100))
    finish(f, (210, 210, 220), 0.2, vig=0.45)


@frame(48, 11, 7, 'Without hesitation, CubeBot lunges and grabs his arm at the last second.')
def f48(f):
    stage(f, PEAKS, 1.0, 800, None)
    gradient(f, (206, 220, 238), (236, 242, 250), GROUND_Y - 30, H)
    for x in (900, 1300, 1550):
        gprop(f, 'cloud-sea', x, 820, 1.0, 1.5)
    block(f, 'rock', 0, 880, 420, H)
    put(f, 'cubebot', 620, 420, 300, rot=-28)
    line(f, [(760, 330), (930, 470)], (171, 169, 165), 30)
    put(f, 'paperbag', 1010, 760, 300, rot=12, shadow=False)
    motion(f, 640, 220, 860, 300, n=3, color=(255, 255, 255, 200))
    drops(f, 5, 1100, 500, 1400, 860, seed=48, size=12, color=(120, 110, 100))
    finish(f, COLD, 0.2)


@frame(49, 11, 8, 'PaperBag dangles over a steep drop. More rocks tumble past. CubeBot strains, slowly pulling him back up.')
def f49(f):
    stage(f, PEAKS, 1.0, 800, None)
    gradient(f, (206, 220, 238), (236, 242, 250), GROUND_Y - 30, H)
    gprop(f, 'cloud-sea', 400, 900, 1.0, 2.0)
    block(f, 'rock', 560, 1100, 520, H)
    put(f, 'cubebot', 800, 520, 300)
    put(f, 'paperbag', 760, 740, 260, rot=-10, shadow=False)
    gprop(f, 'rubble', 1200, 220, 1.0, 1.8, rot=-30)
    motion(f, 1180, 260, 1320, 340, n=3, color=(255, 255, 255, 200))
    finish(f, COLD, 0.2)


# Scene 12 - the enchanted forest.
def thorns(f, zoom=1.0, spots=((300, 300), (900, 220), (1300, 380))):
    for x, y in spots:
        gprop(f, 'thorn-vine', x, y, zoom, 1.2)


def pollen(f, n=50, seed=1):
    sparks(f, n, 0, 0, W, 700, color=(170, 255, 220), seed=seed, size=(2, 5))
    sparks(f, n // 2, 0, 0, W, 700, color=(255, 170, 230), seed=seed + 1, size=(2, 5))


@frame(50, 12, 1, 'They collapse onto solid ground as the last of the rocks settle. PaperBag sits up, breathing hard.', 'PaperBag: "Okay... I take it back. This is definitely trying to kill us."')
def f50(f):
    stage(f, ENCHANTED, 1.3, 800, 'grass', ground_tint=MOSS)
    gprop(f, 'thorn-vine', 520, GROUND_Y + 10, 1.3, 1.0)
    put(f, 'paperbag', 640, GROUND_Y + 20, 250, rot=20)
    put(f, 'cubebot', 960, GROUND_Y + 20, CH * 1.2)
    pollen(f, 24, 50)
    finish(f, vig=0.4)


@frame(51, 12, 2, 'A dense, glowing forest. Tall trees twist toward the sky. Their leaves shimmer faintly, as if breathing.', 'PaperBag: "I don\'t like this place."')
def f51(f):
    stage(f, ENCHANTED, 1.0, 800, 'grass', ground_tint=MOSS)
    thorns(f)
    for x in (300, 700, 1200):
        gprop(f, 'glow-mushroom', x, GROUND_Y, 1.0, 1.4)
    pollen(f, 50, 51)
    put(f, 'cubebot', 800, H + 210, 640, back=True, shadow=False)
    finish(f, vig=0.4)


@frame(52, 12, 3, 'A violent surge of glowing pollen explodes from the trees, forming a swirling storm - a Bloomstorm.', 'Cubebot: "Stay close!"')
def f52(f):
    stage(f, ENCHANTED, 1.3, 800, 'grass', ground_tint=MOSS)
    thorns(f, 1.3, ((200, 200), (1100, 300)))
    put(f, 'cubebot', 720, GROUND_Y + 20, CH * 1.3, rot=14)
    put(f, 'paperbag', 1000, GROUND_Y + 20, CH * 1.05, rot=10)
    sparks(f, 140, 0, 0, W, H, color=(255, 190, 235), seed=52, size=(3, 8))
    motion(f, 0, 100, 1600, 800, n=14, color=(255, 220, 245, 150), width=4, seed=52)
    finish(f, vig=0.45)


@frame(53, 12, 4, 'PaperBag peeks out.', 'PaperBag: "I officially hate magical nature."')
def f53(f):
    stage(f, ENCHANTED, 1.4, 800, 'grass', ground_tint=MOSS)
    put(f, 'golem', 560, GROUND_Y + 10, 560)
    block(f, 'rock', 120, 560, GROUND_Y - 3 * TILE * 1.4 + 60, GROUND_Y + 10, 1.4)
    block(f, 'rock', 660, 980, GROUND_Y - 2 * TILE * 1.4, GROUND_Y + 10, 1.4)
    put(f, 'paperbag', 1200, GROUND_Y + 10, 300, crop=(0, 0, 1, 0.6))
    block(f, 'rock', 1050, 1600, GROUND_Y - TILE * 1.4, GROUND_Y + 10, 1.4)
    pollen(f, 30, 53)
    finish(f, vig=0.45)


@frame(54, 12, 5, 'A heavy thud shakes the ground.')
def f54(f):
    stage(f, ENCHANTED, 1.6, 800, 'grass', ground_tint=MOSS)
    block(f, 'rock', 520, 1080, GROUND_Y - 3 * TILE * 1.6 + 40, GROUND_Y + 10, 1.6)
    for x in (560, 800, 1040):
        gprop(f, 'dust-cloud', x, GROUND_Y + 40, 1.6, 1.6)
    for x in (620, 760, 900, 1020):
        line(f, [(x, 300), (x - 20, 240), (x + 10, 190)], (255, 255, 255), 5)
    finish(f, vig=0.45)


@frame(55, 12, 6, 'From between the trees emerges a massive stone figure - MR. GOLEM.')
def f55(f):
    stage(f, ENCHANTED, 1.8, 800, 'grass', blur=6, ground_tint=MOSS)
    dust(f, 800, 420, 500, seed=55, color=(176, 180, 184), opacity=0.7)
    put(f, 'golem', 800, GROUND_Y - 20, 520, opacity=0.6, shadow=False)
    put(f, 'cubebot', 420, H + 70, 520, crop=(0, 0, 1, 0.6), rot=-12, flip=True, shadow=False)
    put(f, 'paperbag', 1180, H + 70, 500, crop=(0, 0, 1, 0.6), rot=10, shadow=False)
    finish(f, vig=0.5)


@frame(56, 12, 7, 'Perched on his head is a small wooden creature with twig-like limbs - TWIGG.', 'Twigg: "Visitors!"')
def f56(f):
    stage(f, ENCHANTED, 1.4, 800, 'grass', blur=3, ground_tint=MOSS)
    # Mr. Golem's mossy head fills the bottom of the shot; Twigg on top
    x0, y0, x1, y1 = put(f, 'golem', 800, H + 40, 760, crop=(0.05, 0.0, 0.95, 0.5), shadow=False)
    put(f, 'twigg', 880, y0 + (y1 - y0) * 0.36, 300)
    pollen(f, 30, 56)
    finish(f, vig=0.45)


@frame(57, 12, 8, 'Mr. Golem\'s deep voice rumbles like distant thunder.', 'Mr. Golem: "Few survive the Bloomstorm."')
def f57(f):
    stage(f, ENCHANTED, 1.2, 800, 'grass', ground_tint=MOSS)
    thorns(f, 1.2)
    put(f, 'golem', 600, GROUND_Y + 10, 560)
    block(f, 'rock', 220, 520, GROUND_Y - 2 * TILE * 1.2, GROUND_Y + 10, 1.2)
    block(f, 'rock', 900, 1220, GROUND_Y - TILE * 1.2, GROUND_Y + 10, 1.2)
    for x in (1000, 1300, 1450):
        gprop(f, 'glow-root', x, GROUND_Y, 1.2, 1.2)
    pollen(f, 40, 57)
    finish(f, vig=0.45)


# Scene 13 - the water forest.
@frame(58, 13, 1, 'CubeBot stares at the reflection of the sky in the water. Suddenly - the water ripples.')
def f58(f):
    stage(f, WATER, 1.4, 800, 'grass')
    water(f, 600, 1500, GROUND_Y + 60, 160)
    for k in range(4):
        r = 70 + k * 50
        f.d.ellipse([P(1050 - r), P(GROUND_Y + 50 - r * 0.25), P(1050 + r), P(GROUND_Y + 50 + r * 0.25)], outline=(240, 250, 255), width=P(3))
    put(f, 'whitey', 420, GROUND_Y + 30, 420)
    put(f, 'water', 1050, GROUND_Y + 10, 230, shadow=False)
    glow(f, 1050, GROUND_Y - 100, 180, (170, 220, 255), opacity=0.5)
    fog(f, GROUND_Y - 60, GROUND_Y + 40, opacity=0.35)
    finish(f, vig=0.35)


@frame(59, 13, 2, 'From the center of the pool rises a translucent figure - the WATER SPIRIT.')
def f59(f):
    stage(f, WATER, 1.0, 800, 'grass')
    water(f, 420, 1300, GROUND_Y + 40, 140)
    gprop(f, 'white-tree', 1330, GROUND_Y, 1.0, 1.2)
    put(f, 'whitey', 1180, GROUND_Y + 10, 170)
    put(f, 'water', 860, GROUND_Y + 20, 140, opacity=0.85, shadow=False)
    glow(f, 860, GROUND_Y - 60, 120, (170, 220, 255), opacity=0.5)
    put(f, 'cubebot', 300, H + 150, 480, back=True, shadow=False)
    put(f, 'paperbag', 110, H + 150, 400, back=True, shadow=False)
    fog(f, GROUND_Y - 50, GROUND_Y + 30, opacity=0.3)
    finish(f, vig=0.35)


@frame(60, 13, 3, 'From behind a white-barked tree steps WHITEY, calm and watchful.')
def f60(f):
    stage(f, WATER, 1.5, 900, 'grass')
    gprop(f, 'white-tree', 1150, GROUND_Y + 10, 1.5, 1.4)
    put(f, 'whitey', 960, GROUND_Y + 20, 380)
    put(f, 'cubebot', 400, GROUND_Y + 30, CH * 1.5)
    fog(f, GROUND_Y - 60, GROUND_Y + 40, opacity=0.3)
    finish(f, vig=0.35)


@frame(61, 13, 4, 'PaperBag nearly falls backward.', 'PaperBag: "Why does everything here rise dramatically?!"')
def f61(f):
    stage(f, WATER, 2.2, 800, 'grass', blur=6)
    x0, y0, x1, y1 = put(f, 'paperbag', 800, H + 100, 700, crop=(0, 0.05, 1, 0.5), shadow=False)
    bw, bh = x1 - x0, y1 - y0
    for ex, ey in ((0.271, 0.71), (0.777, 0.633)):
        cx, cy = x0 + ex * bw, y0 + ey * bh
        ellipse(f, cx - bw * 0.1, cy - bw * 0.1, cx + bw * 0.1, cy + bw * 0.1, (255, 255, 255))
        spiral(f, cx, cy, bw * 0.085, color=(40, 40, 40), width=6)
    motion(f, 0, 300, 300, 700, n=5, color=(255, 255, 255, 200))
    finish(f, vig=0.45)


@frame(62, 13, 5, 'From the water, objects rise: climbing hooks, enchanted rope, ice-resistant gloves. They float toward CubeBot and PaperBag.', 'Water Spirit: "The next ascent will test not strength... but sacrifice."')
def f62(f):
    stage(f, WATER, 1.3, 800, 'grass')
    water(f, 400, 1200, GROUND_Y + 50, 150)
    glow(f, 800, 480, 300, (200, 240, 255), opacity=0.6)
    # the three gifts, rising out of the pool
    for x, y, r in ((470, 430, 120), (800, 360, 130), (1140, 420, 115)):
        glow(f, x, y, r, (210, 245, 255), opacity=0.55)
    tool(f, 'rope', 470, 430, 190, rot=8)
    tool(f, 'hook', 800, 360, 230, rot=-10)
    tool(f, 'gloves', 1140, 420, 170, rot=-6)
    put(f, 'water', 800, GROUND_Y + 30, 150, opacity=0.85, shadow=False)
    put(f, 'cubebot', 160, GROUND_Y + 40, CH * 1.2)
    put(f, 'paperbag', 1450, GROUND_Y + 40, CH, flip=True)
    sparks(f, 40, 300, 250, 1400, 650, color=(200, 240, 255), seed=62)
    finish(f, vig=0.35)


@frame(63, 13, 6, 'CubeBot looks at PaperBag one last time. Then he turns and begins the climb alone. PaperBag watches him disappear into the mist.')
def f63(f):
    stage(f, WATER, 1.0, 800, 'grass')
    for x in (1150, 1350, 1500):
        gprop(f, 'mist', x, GROUND_Y - 10, 1.0, 1.4)
    put(f, 'paperbag', 360, GROUND_Y + 20, 250)
    put(f, 'cubebot', 1120, GROUND_Y + 10, 230, back=True)
    lay = f.layer()
    ImageDraw.Draw(lay).rectangle([P(950), 0, P(W), P(H)], fill=(240, 248, 252, 150))
    f.add(lay, blur=70)
    finish(f, vig=0.3)


# Scene 14 - the climb.
@frame(64, 14, 1, 'Ahead stands the mountain - impossibly tall, its peak piercing the clouds. CubeBot stands alone at the base.')
def f64(f):
    stage(f, PEAKS, 1.6, 800, 'rock')
    clouds(f, 8, 0, 160, color=(110, 116, 130), size=1.6, seed=64)
    for x in (300, 800, 1300):
        gprop(f, 'cloud-sea', x, 520, 1.6, 1.0)
    put(f, 'cubebot', 800, H + 60, 520, back=True, crop=(0, 0, 1, 0.6), shadow=False)
    finish(f, (180, 190, 210), 0.3, vig=0.45)


@frame(65, 14, 2, 'CubeBot tightens the straps of the enchanted gloves given by the Water Spirit. He hooks the climbing rope to his side.')
def f65(f):
    stage(f, PEAKS, 2.4, 800, 'rock', blur=8)
    # close on the Water Spirit's gifts: the gloves strapped on, the rope and
    # its hook at his side
    tool(f, 'gloves', 640, 520, 380, rot=-4)
    tool(f, 'rope', 1240, 600, 330, rot=-12)
    tool(f, 'hook', 1330, 360, 300, rot=-18)
    finish(f, COLD, 0.2, vig=0.5)


@frame(66, 14, 3, 'Then - he begins.')
def f66(f):
    gradient(f, (0, 200, 240), (150, 220, 245), 0, 700)
    glow(f, 1120, 690, 220, (255, 190, 80), opacity=0.9)
    ellipse(f, 1020, 590, 1220, 790, (240, 160, 30))
    clouds(f, 6, 60, 300, seed=66)
    gradient(f, (160, 160, 170), (130, 130, 140), 800, H)
    for x in (700, 1000, 1300, 1600):
        gprop(f, 'cloud-sea', x, 830, 1.4, 1.3)
    # the stepped cliff face he starts up, snow on every third ledge
    edge = [(0, H)]
    for r in range(12):
        width = (7 - r // 3) * 80
        edge += [(width, H - r * 80), (width, H - (r + 1) * 80)]
    edge += [(0, H - 12 * 80)]
    paint.rock_face(f.img, edge, 'snow', seed=66)
    put(f, 'cubebot', 520, 470, 140, rot=-10, shadow=False)
    line(f, [(560, 380), (600, 0)], (190, 150, 90), 4)
    finish(f, SUNSET, 0.2, vig=0.35)


@frame(67, 14, 4, 'He pulls himself upward. Loose stones tumble past him. His mechanical fingers strain against the jagged surface.')
def f67(f):
    gradient(f, (200, 210, 224), (240, 242, 246), 0, H)
    for x in (100, 400, 700):
        gprop(f, 'cloud-sea', x, 880, 2.0, 1.4)
    block(f, 'snow', 820, 1600, 300, H, 2.4)
    cube_hand(f, 860, 360, 220, rot=-20, arm=(420, H + 40))
    line(f, [(900, 500), (1000, 900)], (190, 150, 90), 10)
    drops(f, 5, 520, 560, 760, 880, seed=67, size=12, color=(120, 116, 110))
    finish(f, COLD, 0.2, vig=0.4)


@frame(68, 14, 5, 'He forces himself up again. Step. Drag. Step. Drag. His systems flicker. His body is scratched, dented, and dusted in frost.')
def f68(f):
    stage(f, PEAKS, 1.0, 800, 'snow')
    block(f, 'snow', 0, 640, GROUND_Y - 3 * TILE, GROUND_Y)
    block(f, 'snow', 640, 1100, GROUND_Y - 5 * TILE, GROUND_Y)
    block(f, 'snow', 1100, 1600, GROUND_Y - 7 * TILE, GROUND_Y)
    put(f, 'cubebot', 900, GROUND_Y - 5 * TILE, 230, rot=8)
    line(f, [(1000, GROUND_Y - 7 * TILE), (920, GROUND_Y - 5 * TILE - 120)], (190, 150, 90), 6)
    sparks(f, 60, 0, 0, W, H, color=(255, 255, 255), seed=68, size=(2, 4))
    finish(f, (190, 205, 240), 0.3, vig=0.4)


# Scene 15 - the summit.
def summit(f, zoom=1.0, fx=800, blur=0):
    stage(f, PEAKS, zoom, fx, 'snow', blur=blur)
    for x in (200, 800, 1400):
        gprop(f, 'cloud-sea', x, GROUND_Y + 10, zoom, 1.4, blur=blur)


@frame(69, 15, 1, 'The sky glows pale gold above the clouds. CubeBot kneels weakly on the frozen summit.')
def f69(f):
    summit(f, 1.2)
    put(f, 'cubebot', 760, H + 60, 540, back=True, crop=(0, 0, 1, 0.6), rot=-6, shadow=False)
    finish(f, GOLD, 0.3, vig=0.35)


@frame(70, 15, 2, 'At the center of the peak, a single glowing flower grows from the stone. The Undying Flower.')
def f70(f):
    summit(f, 1.0)
    top = mound(f, 640, 1040, kind='snow', place='mountains')
    flower_glow(f, 840, top, 1.0)
    put(f, 'cubebot', 380, GROUND_Y + 10, 150, rot=60, shadow=False)
    finish(f, GOLD, 0.3, vig=0.35)


@frame(71, 15, 3, 'CubeBot crawls toward it. His vision flickers. Warning lights flash faintly in his optics.')
def f71(f):
    summit(f, 1.6, 900)
    block(f, 'snow', 980, 1440, GROUND_Y - 2 * TILE * 1.6, GROUND_Y, 1.6)
    flower_glow(f, 1210, GROUND_Y - 2 * TILE * 1.6, 1.4)
    put(f, 'cubebot', 480, GROUND_Y - 60, 300, rot=-60, anchor='center', shadow=False)
    finish(f, (255, 200, 150), 0.3, vig=0.45)


@frame(72, 15, 4, 'His vision distorts.', 'FlowerGirl: "CubeBot... wake up... please wake up..."')
def f72(f):
    stage(f, FIELD, 2.2, 800, 'grass', blur=8)
    put(f, 'flowergirl', 780, H + 20, 560, crop=(0.0, 0.0, 1.0, 0.74), rot=-14, shadow=False)
    light(f, (255, 255, 255), 0.2)
    eyelids(f, opening=0.33, tilt=-14)


@frame(73, 15, 5, 'The light becomes blinding. CubeBot collapses. Darkness... then a familiar face.')
def f73(f):
    summit(f, 2.4, 800, blur=10)
    put(f, 'paperbag', 760, H + 40, 760, crop=(0, 0, 1, 0.55), rot=-38, shadow=False)
    light(f, (255, 255, 255), 0.3)
    eyelids(f, opening=0.42, tilt=-38)


@frame(74, 15, 6, 'He reaches out. His trembling fingers wrap around the stem. He pulls it free.')
def f74(f):
    summit(f, 1.3)
    put(f, 'cubebot', 560, GROUND_Y - 50, 300, rot=-90, anchor='center', shadow=False)
    flower_glow(f, 860, GROUND_Y - 10, 1.0)
    put(f, 'paperbag', 1160, GROUND_Y + 20, 260, rot=-14)
    finish(f, GOLD, 0.25, vig=0.35)


@frame(75, 15, 7, 'CubeBot\'s vision slowly clears. The storm calms. PaperBag notices the glowing flower in his hand.', 'PaperBag: "You found it."')
def f75(f):
    summit(f, 2.4, 800, blur=8)
    put(f, 'paperbag', 760, H + 40, 760, crop=(0, 0, 1, 0.55), rot=-30, shadow=False)
    eyelids(f, opening=0.6, tilt=-30)


@frame(76, 15, 8, 'CubeBot looks down at it. The light still pulses faintly. But he is barely holding on.')
def f76(f):
    summit(f, 1.6, 800)
    put(f, 'cubebot', 680, GROUND_Y + 30, 380, rot=-5)
    flower_glow(f, 860, GROUND_Y - 120, 0.9)
    put(f, 'paperbag', 1200, GROUND_Y + 40, 330)
    finish(f, GOLD, 0.25, vig=0.4)


# Scene 16 - the road home.
@frame(77, 16, 1, 'CubeBot and PaperBag run down the dirt road leading back to the kingdom. CubeBot clutches the glowing Undying Flower in both hands.')
def f77(f):
    stage(f, FIELD, 1.6, 800, 'grass')
    path_strip(f, 800, 800, 160, 900)
    put(f, 'paperbag', 480, GROUND_Y + 140, 460, rot=6)
    put(f, 'cubebot', 1040, GROUND_Y + 150, 500)
    flower_glow(f, 1060, GROUND_Y - 80, 1.0)
    motion(f, 0, 300, 300, 700, n=5, color=(255, 255, 255, 170))
    finish(f, OVERCAST, 0.3, vig=0.35)


@frame(78, 16, 2, 'His movements are slower than before, but determined. PaperBag glances nervously at the castle ahead.', 'PaperBag: "We made it... we actually made it."')
def f78(f):
    stage(f, WALLS, 1.0, 800, 'grass')
    gprop(f, 'gate', 1000, GROUND_Y, 1.0, 1.2)
    path_strip(f, 1000, 900, 140, 700)
    put(f, 'cubebot', 300, H + 60, 520, back=True, crop=(0, 0, 1, 0.6), shadow=False)
    finish(f, OVERCAST, 0.35, vig=0.35)


@frame(79, 16, 3, 'CubeBot says nothing. His focus is locked on the towering castle gates in the distance.')
def f79(f):
    # The road home through the edge of town to the castle gates, standing in
    # the distance against the World Tree under a grey sky.
    gradient(f, (172, 182, 198), (214, 220, 228), 0, 600)
    clouds(f, 7, 40, 260, color=(198, 204, 214), size=1.3, seed=79)
    gprop(f, 'world-tree', 800, 610, 1.0, 1.9)
    fog(f, 380, 600, color=(214, 220, 228), opacity=0.45)
    # the castle wall, its towers and the closed gate, far off
    tile_wall(f, 'castle-block', 470, 612, 18, 3, 36)
    for x in range(470, 1120, 36):
        rect(f, x + 4, 492, x + 24, 506, (140, 136, 152))
    for x in (480, 1110):
        gprop(f, 'castle-tower', x, 614, 0.55)
    gprop(f, 'gate', 800, 614, 0.6, 1.3)
    for x in (640, 960):
        gprop(f, 'banner', x, 560, 0.6, 1.3)
    put(f, 'guard', 752, 612, 56)
    put(f, 'headguard', 848, 612, 60, flip=True)
    # the fields and the road in
    gradient(f, (124, 164, 92), (92, 136, 70), 600, H)
    path_strip(f, 800, 800, 70, 760, y_far=612)
    for k, (x, y) in enumerate(((560, 660), (1040, 660), (470, 760), (1130, 760), (360, 870), (1240, 870))):
        gflower(f, x, y, ('yellow', 'red', 'pink', 'blue')[k % 4], 0.6 + (y - 600) / 300, 1.0)
    # the last houses of the outer town, the market and the lamps
    house_block(f, -40, 5, 3)
    house_block(f, 1240, 6, 3)
    gprop(f, 'market-stall', 430, GROUND_Y + 30, 1.0, 1.0)
    tile_wall(f, 'barrel', 1120, GROUND_Y + 40, 2, 1, 60)
    tile_wall(f, 'wood-crate', 1150, GROUND_Y - 20, 1, 1, 60)
    gprop(f, 'lamp-post', 330, H - 20, 1.2)
    gprop(f, 'lamp-post', 1270, H - 20, 1.2)
    # CubeBot and PaperBag on the road, the flower's glow in his hands
    put(f, 'cubebot', 830, 770, 150, back=True)
    put(f, 'paperbag', 735, 770, 125, back=True)
    glow(f, 830, 700, 70, (255, 245, 210), opacity=0.6)
    finish(f, OVERCAST, 0.25, vig=0.35)


@frame(80, 16, 4, 'The massive gates remain closed. Armed guards stand firm. The HEAD GUARD steps forward.', 'Head Guard: "State your business."')
def f80(f):
    stage(f, WALLS, 1.8, 800, 'grass')
    gprop(f, 'gate', 800, GROUND_Y + 20, 1.8, 1.3)
    put(f, 'guard', 480, GROUND_Y + 140, 640)
    put(f, 'headguard', 1120, GROUND_Y + 140, 640, flip=True)
    line(f, [(560, 120), (1080, 860)], (140, 100, 60), 14)
    line(f, [(1040, 120), (520, 860)], (140, 100, 60), 14)
    pendant(f, 800, 760, 1.4)
    finish(f, OVERCAST, 0.3, vig=0.4)


@frame(81, 16, 5, 'The two enter the castle grounds, escorted inside. The gates close behind them with a heavy thud.', 'Head Guard: "Open the gates. Follow me."')
def f81(f):
    room(f, 'castle-hall-day', 1.0, 800, 'castle')
    gprop(f, 'room-doorway', 1300, GROUND_Y, 1.0, 1.0)
    for x in (300, 900):
        gprop(f, 'banner', x, GROUND_Y - 280, 1.0, 1.4)
    put(f, 'headguard', 1180, GROUND_Y + 10, CH)
    put(f, 'cubebot', 800, GROUND_Y + 10, CH * 0.95)
    put(f, 'paperbag', 600, GROUND_Y + 10, CH * 0.8)
    put(f, 'guard', 340, GROUND_Y + 10, CH)
    finish(f, vig=0.3)


# Scene 17 - the Princess's room.
@frame(82, 17, 1, 'The room is heavy with silence. Curtains are drawn halfway. Sunlight barely reaches the bed. The Princess lies pale and still.')
def f82(f):
    room(f, 'princess-room-day', 1.3, 900, 'carpet', dim=0.45)
    gprop(f, 'canopy-bed', 760, GROUND_Y + 10, 1.3, 1.6)
    lying(f, 'flowergirl', 520, 990, 487, 105, cover=(200, 140, 175))
    gprop(f, 'potted-plant', 1350, GROUND_Y, 1.3, 1.6)
    put(f, 'king', 1150, GROUND_Y + 20, CH * 1.2)
    put(f, 'doctor', 330, GROUND_Y + 20, CH * 1.2)
    finish(f, vig=0.5)


@frame(83, 17, 2, 'CubeBot steps ahead. In his hands, the glowing Undying Flower. Its soft light fills the space.', 'Cubebot: "This will cure her."')
def f83(f):
    room(f, 'princess-room-day', 1.8, 800, 'carpet', dim=0.35, blur=3)
    gprop(f, 'table', 420, GROUND_Y + 40, 1.8, 1.4)
    gprop(f, 'glass-dome', 420, GROUND_Y - 60, 1.8, 2.0)
    glow(f, 420, GROUND_Y - 260, 300, (255, 245, 210), opacity=0.8)
    put(f, 'cubebot', 900, GROUND_Y + 60, 420)
    finish(f, vig=0.45)


@frame(84, 17, 3, 'Her eyes flutter open. Soft. Confused. Alive. The King looks stunned. The guards lower their weapons.', 'FlowerGirl (weakly): "CubeBot...?"')
def f84(f):
    room(f, 'princess-room-day', 1.6, 900, 'carpet', dim=0.15)
    gprop(f, 'canopy-bed', 760, GROUND_Y + 60, 1.6, 1.8)
    tucked_in(f, 'flowergirl', 760, GROUND_Y - 40, 320)
    glow(f, 760, GROUND_Y - 260, 200, (255, 245, 200), opacity=0.4)
    put(f, 'king', 1360, H + 60, 480, crop=(0, 0, 1, 0.6), flip=True, shadow=False)
    finish(f, vig=0.4)


@frame(85, 17, 4, 'CubeBot steps forward, overwhelmed. PaperBag grins from the corner. Her smile is warm.')
def f85(f):
    room(f, 'princess-room-day', 1.2, 800, 'carpet')
    gprop(f, 'canopy-bed', 900, GROUND_Y + 10, 1.2, 1.6)
    tucked_in(f, 'flowergirl', 900, GROUND_Y - 50, 240)
    put(f, 'cubebot', 520, GROUND_Y + 20, CH * 1.15)
    put(f, 'paperbag', 1420, GROUND_Y + 20, CH * 0.9)
    put(f, 'king', 1180, GROUND_Y + 20, CH * 1.15)
    finish(f, (255, 236, 210), 0.15, vig=0.35)


@frame(86, 17, 5, 'FlowerGirl looks at CubeBot.')
def f86(f):
    room(f, 'princess-room-day', 2.0, 800, 'carpet', blur=5)
    put(f, 'cubebot', 800, H + 120, 680, crop=(0, 0, 1, 0.8), shadow=False)
    pendant(f, 880, 620, 1.6)
    finish(f, (255, 236, 210), 0.15, vig=0.4)


@frame(87, 17, 6, 'CubeBot gives the pendant back to FlowerGirl.')
def f87(f):
    room(f, 'princess-room-day', 2.6, 900, 'carpet', blur=10)
    # her open hand reaching up from the left, his hand from the right
    cx, cy = flower_hand(f, 610, 600, (80, H + 160), (330, 940), k=1.45, thumb=1)
    flower_cuff(f, cx, cy, k=1.45)
    cube_hand(f, 760, 330, 220, rot=30, arm=(1340, H + 60))
    pendant(f, 640, 420, 2.0)
    finish(f, (255, 236, 210), 0.15, vig=0.45)


@frame(88, 17, 7, 'The pendant rests once more around her neck.')
def f88(f):
    room(f, 'princess-room-day', 2.0, 800, 'carpet', blur=5)
    light(f, (255, 240, 210), 0.15)
    put(f, 'flowergirl', 800, H + 20, 760, crop=(0, 0, 1, 0.75), shadow=False)
    pendant(f, 800, 740, 1.6)
    rays(f, (255, 240, 200), x0=900, opacity=0.35)
    finish(f, vig=0.35)


@frame(89, 17, 8, 'Outside, the kingdom feels alive again. Peace restored.')
def f89(f):
    sub = Frame(89)
    stage(sub, FIELD, 1.0, 800, 'grass')
    gprop(sub, 'world-tree', 800, GROUND_Y + 20, 1.0, 1.6)
    room(f, 'princess-room-day', 1.0, 800, 'carpet')
    m = Image.new('L', f.img.size, 0)
    ImageDraw.Draw(m).ellipse([P(560), P(110), P(1040), P(590)], fill=255)
    ImageDraw.Draw(m).rectangle([P(560), P(350), P(1040), P(700)], fill=255)
    f.img = Image.composite(sub.img, f.img, m)
    poly(f, [(540, 100), (690, 100), (600, 700), (540, 700)], (176, 64, 90))
    poly(f, [(1060, 100), (910, 100), (1000, 700), (1060, 700)], (176, 64, 90))
    put(f, 'cubebot', 800, H + 60, 440, back=True, crop=(0, 0, 1, 0.6), shadow=False)
    rays(f, (255, 240, 200), x0=600, n=3, opacity=0.35)
    finish(f, vig=0.3)


@frame(90, 17, 9, 'The End.')
def f90(f):
    stage(f, FIELD, 1.0, 800, 'grass')
    gprop(f, 'world-tree', 800, GROUND_Y + 20, 1.0, 1.7)
    for x, c in ((200, 'red'), (330, 'yellow'), (1250, 'pink'), (1400, 'blue')):
        gflower(f, x, GROUND_Y + 10, c, 1.0, 1.3)
    light(f, (255, 245, 225), 0.45)
    text_center(f, 'The End', 330, 120, color=(90, 60, 50))
    finish(f, vig=0.25)
