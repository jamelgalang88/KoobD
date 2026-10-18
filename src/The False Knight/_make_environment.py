# Draws the False Knight environment art that the provided assets do not
# cover - the town, the castle (outer walls, gate, courtyard, hallway, the
# Princess's room), the grand library, the mountains and the World Tree - plus
# the castle/town/mountain obstacle tiles and the scenery props, in the same
# pixel style as the provided tileset and meadow (16px tiles, 1px outlines,
# 240x135 backgrounds whose ground line sits at 80% of the height).
#
#   python _make_environment.py        (run from "The False Knight" folder)
#
# Output: environment/backgrounds/*.png, platforms/tiles/*.png (new tiles),
# environment/props/*.png.
import math
import os
import random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(HERE, 'environment', 'backgrounds')
PROPS = os.path.join(HERE, 'environment', 'props')
TILES = os.path.join(HERE, 'platforms', 'tiles')
for folder in (BG, PROPS, TILES):
    os.makedirs(folder, exist_ok=True)

W, H, GROUND = 240, 135, 108   # background size; drawn ground line (80%)
OUT = '#2b2230'                # outline colour, as in the provided art


def canvas(w, h, fill=(0, 0, 0, 0)):
    img = Image.new('RGBA', (w, h), fill)
    return img, ImageDraw.Draw(img)


def rect(d, x, y, w, h, c):
    if w > 0 and h > 0:
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def orect(d, x, y, w, h, c, o=OUT):
    rect(d, x, y, w, h, o)
    rect(d, x + 1, y + 1, w - 2, h - 2, c)


def save(img, folder, name):
    img.save(os.path.join(folder, name))
    print('wrote', os.path.relpath(os.path.join(folder, name), HERE))


# --- Backgrounds -----------------------------------------------------------------

def stone_wall(d, x0, y0, x1, y1, base, dark, light, bw=12, bh=6, rnd=None):
    """Coursed stone blocks between (x0,y0) and (x1,y1)."""
    rnd = rnd or random.Random(7)
    rect(d, x0, y0, x1 - x0, y1 - y0, base)
    row = 0
    for y in range(y0, y1, bh):
        off = (bw // 2) * (row % 2)
        for x in range(x0 - off, x1, bw):
            shade = rnd.choice([base, base, light, dark])
            rect(d, max(x0, x + 1), y + 1, min(bw - 1, x1 - max(x0, x + 1)), bh - 1, shade)
            rect(d, max(x0, x), y, 1, bh, dark)
        rect(d, x0, y, x1 - x0, 1, dark)
        row += 1


def crenellations(d, x0, x1, y, c, o=OUT, merlon=6, gap=4, h=5):
    x = x0
    while x < x1:
        orect(d, x, y - h, min(merlon, x1 - x), h + 1, c, o)
        x += merlon + gap


def castle_walls():
    """The castle's outer walls: a curtain wall between two towers, with a
    banner, arrow slits and a walkway - one copy per screen."""
    img, d = canvas(W, H)
    rnd = random.Random(3)
    # curtain wall
    stone_wall(d, 0, 48, W, GROUND, '#8d8a9a', '#6c6979', '#a7a4b3', rnd=rnd)
    crenellations(d, 0, W, 48, '#9a97a7')
    rect(d, 0, 52, W, 2, '#6c6979')
    # towers
    for tx in (18, 168):
        stone_wall(d, tx, 20, tx + 52, GROUND, '#97a0ad', '#717a88', '#b3bbc6', bw=10, bh=6, rnd=rnd)
        rect(d, tx, 20, 1, GROUND - 20, OUT)
        rect(d, tx + 51, 20, 1, GROUND - 20, OUT)
        crenellations(d, tx - 2, tx + 54, 20, '#a3acb8', merlon=7, gap=3)
        for wy in (34, 60):  # arrow slits
            rect(d, tx + 24, wy, 4, 10, OUT)
            rect(d, tx + 25, wy + 1, 2, 8, '#2c3550')
        # banner
        rect(d, tx + 22, 74, 8, 1, '#5a3a1c')
        d.polygon([(tx + 22, 75), (tx + 29, 75), (tx + 29, 96), (tx + 26, 92), (tx + 22, 96)], fill='#b23a35', outline=OUT)
        rect(d, tx + 24, 80, 4, 4, '#e8b83c')
    # arched windows on the wall
    for wx in (92, 126):
        rect(d, wx, 66, 10, 16, OUT)
        rect(d, wx + 1, 69, 8, 12, '#2c3550')
        rect(d, wx + 2, 67, 6, 2, '#2c3550')
    # moss and vines at the foot
    for vx in range(4, W, 23):
        h = rnd.randint(6, 18)
        rect(d, vx, GROUND - h, 1, h, '#4f8a3a')
        rect(d, vx + 1, GROUND - h + 3, 1, h - 3, '#3f7a30')
    rect(d, 0, GROUND - 2, W, 2, '#5b6a4a')
    save(img, BG, 'castle-walls.png')


def castle_hall(night=True):
    """Inside the castle: a vaulted hallway of arches and pillars with tall
    windows and hanging banners (the courtyard steps lead in here)."""
    img, d = canvas(W, H)
    rnd = random.Random(11)
    stone_wall(d, 0, 0, W, GROUND, '#6f6878', '#585261', '#857e8e', bw=14, bh=7, rnd=rnd)
    sky = '#1c2546' if night else '#9fd2f0'
    for i, ax in enumerate(range(10, W, 60)):
        # arch frame
        rect(d, ax, 22, 40, 74, '#4b4553')
        rect(d, ax + 4, 30, 32, 66, sky)
        d.pieslice([ax + 4, 14, ax + 35, 46], 180, 360, fill=sky)
        d.arc([ax + 3, 13, ax + 36, 47], 180, 360, fill=OUT)
        rect(d, ax + 19, 30, 2, 66, '#4b4553')       # mullion
        rect(d, ax + 4, 60, 32, 2, '#4b4553')
        if night:
            for _ in range(5):
                rect(d, ax + 5 + rnd.randint(0, 29), 32 + rnd.randint(0, 26), 1, 1, '#f4f1d6')
        # pillar between arches
        px = ax + 46
        orect(d, px, 8, 10, GROUND - 8, '#a49cad')
        rect(d, px + 2, 9, 2, GROUND - 10, '#bcb4c4')
        orect(d, px - 2, 8, 14, 5, '#bcb4c4')
        orect(d, px - 2, GROUND - 5, 14, 5, '#8d8597')
        # banner hanging from the pillar head
        if i % 2 == 0:
            d.polygon([(px + 1, 14), (px + 8, 14), (px + 8, 44), (px + 4, 40), (px + 1, 44)], fill='#9c2f3a', outline=OUT)
            rect(d, px + 3, 20, 4, 4, '#e8b83c')
    rect(d, 0, GROUND - 3, W, 3, '#3f3a47')
    save(img, BG, 'castle-hall-night.png' if night else 'castle-hall-day.png')


def princess_room(night=True):
    """The Princess's room: soft wallpaper, a curtained window, a painting and
    wainscoting."""
    img, d = canvas(W, H)
    wall, stripe = ('#8f7aa3', '#806b95') if night else ('#e6c9d9', '#dbb9cb')
    rect(d, 0, 0, W, GROUND, wall)
    for x in range(0, W, 8):
        rect(d, x, 0, 3, GROUND, stripe)
    # wainscot
    rect(d, 0, 78, W, GROUND - 78, '#7a5233')
    for x in range(4, W, 20):
        orect(d, x, 82, 16, 22, '#8d6140', '#5e3d24')
    rect(d, 0, 76, W, 3, '#5e3d24')
    # window with curtains
    sky = '#22305a' if night else '#a8dcf5'
    orect(d, 90, 14, 60, 54, sky, '#5e3d24')
    rect(d, 119, 15, 2, 52, '#5e3d24')
    rect(d, 91, 40, 58, 2, '#5e3d24')
    if night:
        d.ellipse([132, 20, 141, 29], fill='#f6f1c9')
    # curtains, gathered toward the bottom
    d.polygon([(82, 8), (94, 8), (94, 72), (86, 72)], fill='#b24e6c', outline=OUT)
    d.polygon([(146, 8), (158, 8), (154, 72), (146, 72)], fill='#b24e6c', outline=OUT)
    rect(d, 78, 6, 84, 3, '#e8b83c')
    # painting
    orect(d, 26, 24, 34, 26, '#6fb5c9', '#c9952e')
    d.polygon([(30, 46), (42, 32), (56, 46)], fill='#4f8a5a')
    rect(d, 46, 30, 6, 6, '#f6d36b')
    orect(d, 186, 28, 26, 22, '#e7a7bf', '#c9952e')
    d.ellipse([194, 34, 204, 44], fill='#f2f0ea')
    rect(d, 198, 37, 3, 3, '#6b3a00')
    save(img, BG, 'princess-room-night.png' if night else 'princess-room-day.png')


def library():
    """The grand library: rows of tall shelves full of books under arched
    windows."""
    img, d = canvas(W, H)
    rnd = random.Random(21)
    rect(d, 0, 0, W, GROUND, '#4a3326')
    for ax in range(0, W, 80):
        rect(d, ax + 30, 4, 20, 26, '#22305a')
        d.pieslice([ax + 30, 0, ax + 49, 14], 180, 360, fill='#22305a')
        rect(d, ax + 39, 6, 2, 24, '#4a3326')
    book_colours = ['#9c2f3a', '#2f5a9c', '#3f7a3c', '#c9952e', '#6b3f8f', '#b65c2a', '#2f7a7a']
    for sx in range(4, W, 40):
        orect(d, sx, 34, 34, GROUND - 34, '#6b4630', '#3a2418')
        for shelf_y in range(38, GROUND - 4, 12):
            rect(d, sx + 2, shelf_y + 10, 30, 2, '#3a2418')
            x = sx + 3
            while x < sx + 31:
                bw = rnd.choice([2, 2, 3])
                bh = rnd.randint(7, 10)
                if rnd.random() < 0.08:
                    x += 2
                    continue
                rect(d, x, shelf_y + 10 - bh, bw, bh, rnd.choice(book_colours))
                rect(d, x, shelf_y + 10 - bh, bw, 1, '#f0e2c2')
                x += bw
    rect(d, 0, GROUND - 3, W, 3, '#2e1d14')
    save(img, BG, 'library.png')


def house(d, x, bw, top, rnd):
    """One complete timbered house standing on the ground line: walls, frame,
    windows, door, a pitched roof and sometimes a chimney."""
    walls = ['#e8d3a8', '#d9b98a', '#e2c7a2', '#cfd8c3']
    roofs = ['#b5523b', '#8f3e2c', '#9c5a35', '#6d5a8f']
    wall = rnd.choice(walls)
    roof = rnd.choice(roofs)
    peak = top - 16
    # chimney first, so the roof slope covers its foot
    if rnd.random() < 0.6:
        cx = x + rnd.randint(5, bw - 11)
        orect(d, cx, peak + 2, 6, 14, '#8d6a5a')
        rect(d, cx - 1, peak + 1, 8, 2, '#6d4a3a')
    orect(d, x, top, bw, GROUND - top + 1, wall)
    rect(d, x + 1, top + 10, bw - 2, 2, '#6b4426')
    for tx in range(x + 1, x + bw - 1, 10):
        rect(d, tx, top + 1, 2, GROUND - top - 1, '#6b4426')
    rect(d, x + bw - 3, top + 1, 2, GROUND - top - 1, '#6b4426')
    d.polygon([(x - 3, top + 1), (x + bw // 2, peak), (x + bw + 2, top + 1)], fill=roof, outline=OUT)
    for ry in range(peak + 4, top, 4):
        half = (ry - peak) * (bw // 2 + 2) // (top - peak)
        rect(d, x + bw // 2 - half + 1, ry, 2 * half - 2, 1, '#00000033')
    for wx in range(x + 5, x + bw - 8, 13):
        orect(d, wx, top + 15, 7, 8, '#5b7fa8')
        rect(d, wx + 3, top + 16, 1, 6, '#3a2418')
        rect(d, wx - 1, top + 23, 9, 1, '#6b4426')
    dx = x + bw // 2 - 4
    orect(d, dx, GROUND - 14, 9, 15, '#7a4a2a')
    rect(d, dx + 6, GROUND - 7, 1, 1, '#e8b83c')


def seer_house():
    """The Seer's house in the city (scene 8): a low wooden room lit by the
    hearth, shelves of jars and potions, bundles of drying herbs, star charts,
    and a round window with the storm outside."""
    img, d = canvas(W, H, (74, 50, 40, 255))
    rnd = random.Random(21)
    for x in range(0, W, 10):                       # plank walls
        rect(d, x, 0, 9, GROUND, rnd.choice(['#6b4a36', '#71503a', '#654532']))
        rect(d, x + 9, 0, 1, GROUND, '#4a3224')
    for y in (18, 70):                              # beams
        orect(d, 0, y, W, 5, '#4a3224', '#2e1e16')
    for x in (60, 150):
        orect(d, x, 0, 6, GROUND, '#4a3224', '#2e1e16')
    # the round window, rain outside
    d.ellipse([92, 26, 128, 62], fill=OUT)
    d.ellipse([94, 28, 126, 60], fill='#1e2a48')
    for k in range(9):
        x0 = 96 + k * 3
        d.line([(x0, 30 + (k % 3) * 6), (x0 - 2, 38 + (k % 3) * 6)], fill='#8fa6d0')
    rect(d, 109, 28, 2, 32, OUT)
    rect(d, 94, 43, 32, 2, OUT)
    # shelves of jars and potions
    for sx, sy in ((8, 32), (8, 50), (164, 32), (164, 50)):
        orect(d, sx, sy + 12, 46, 3, '#8d6140', '#4a3224')
        x = sx + 2
        while x < sx + 42:
            w = rnd.choice([4, 5, 6])
            h = rnd.randint(6, 11)
            c = rnd.choice(['#7fb8f0', '#b07fe0', '#7fe0a8', '#f08f8f', '#f2c94c', '#e8e0f0'])
            orect(d, x, sy + 12 - h, w, h, c)
            rect(d, x + 1, sy + 12 - h + 1, 1, h - 3, '#ffffff')
            x += w + 1
    # drying herbs hanging from the beam
    for x in (70, 82, 136, 146):
        d.line([(x, 23), (x, 30)], fill='#3a2a1c')
        d.polygon([(x - 4, 30), (x + 4, 30), (x + 2, 44), (x - 2, 44)], fill=rnd.choice(['#5f9a4a', '#7fae5a', '#8a9a4a']), outline=OUT)
    # star chart
    orect(d, 196, 80, 30, 22, '#d8c8a0', '#5e3d24')
    for k in range(7):
        d.point((200 + rnd.randint(0, 22), 84 + rnd.randint(0, 14)), fill='#3a3a6a')
    d.arc([204, 84, 220, 98], 30, 300, fill='#3a3a6a')
    # the hearth
    orect(d, 14, 74, 40, 34, '#7a7a86', '#4a4a56')
    rect(d, 20, 84, 28, 24, '#1e1410')
    d.polygon([(26, 108), (30, 92), (34, 100), (38, 88), (42, 108)], fill='#ff9a2e')
    d.polygon([(30, 108), (34, 98), (38, 108)], fill='#ffe28a')
    rect(d, 12, 72, 44, 4, '#5a5a66')
    rect(d, 0, GROUND - 2, W, 2, '#3a261c')
    save(img, BG, 'seer-house.png')


def castle_courtyard():
    """Inside the castle walls (scene 6): the keep's front with its arcade of
    arches, steps up to the great door, a fountain and flower beds."""
    img, d = canvas(W, H)
    rnd = random.Random(31)
    stone_wall(d, 0, 36, W, GROUND, '#a09cad', '#7d7a8c', '#b6b2c2', bw=14, bh=7, rnd=rnd)
    crenellations(d, 0, W, 36, '#aaa6b6')
    for tx in (20, 196):                            # corner turrets
        stone_wall(d, tx, 12, tx + 28, GROUND, '#a7b0bd', '#7f8896', '#bdc5d0', bw=10, bh=6, rnd=rnd)
        d.polygon([(tx - 2, 13), (tx + 14, -6), (tx + 30, 13)], fill='#5b78a8', outline=OUT)
        rect(d, tx + 12, 30, 4, 9, OUT)
    for ax in range(58, 186, 26):                   # the arcade
        rect(d, ax, 64, 18, 44, '#3a3646')
        d.pieslice([ax, 56, ax + 18, 74], 180, 360, fill='#3a3646')
        rect(d, ax + 2, 70, 14, 38, '#2a2634')
        rect(d, ax + 19, 60, 5, 48, '#8d8a9a')
    for wx in (70, 122, 174):                       # lit windows above
        rect(d, wx, 42, 8, 12, OUT)
        rect(d, wx + 1, 43, 6, 10, '#f6d36b')
    for k, bx in enumerate((48, 186)):              # banners
        d.polygon([(bx, 40), (bx + 9, 40), (bx + 9, 64), (bx + 4, 60), (bx, 64)], fill='#b23a35', outline=OUT)
        rect(d, bx + 3, 46, 3, 3, '#e8b83c')
    # fountain
    orect(d, 98, 96, 44, 12, '#b6b2c2', '#5d5a6b')
    rect(d, 102, 98, 36, 4, '#7fb8f0')
    orect(d, 116, 80, 8, 18, '#b6b2c2', '#5d5a6b')
    d.ellipse([110, 74, 130, 84], fill='#b6b2c2', outline='#5d5a6b')
    for x in (114, 120, 126):
        d.line([(x, 76), (x + (x - 120) // 2, 70)], fill='#bfe0ff')
    # flower beds along the wall
    for fx in (8, 150, 206):
        orect(d, fx, 100, 28, 8, '#6b4426', '#3a2418')
        for k in range(5):
            rect(d, fx + 3 + k * 5, 97, 3, 3, rnd.choice(['#e0453c', '#f08fc0', '#f2c94c']))
    save(img, BG, 'castle-courtyard.png')


def castle_outskirts():
    """Outside the castle walls (scene 7): the great wall behind, a lane of
    shuttered houses and a street lamp along it."""
    img, d = canvas(W, H)
    rnd = random.Random(41)
    stone_wall(d, 0, 22, W, GROUND, '#8d8a9a', '#6c6979', '#a7a4b3', rnd=rnd)
    crenellations(d, 0, W, 22, '#9a97a7')
    for tx in (70, 190):
        stone_wall(d, tx, 6, tx + 30, GROUND, '#97a0ad', '#717a88', '#b3bbc6', bw=10, bh=6, rnd=rnd)
        crenellations(d, tx - 2, tx + 32, 6, '#a3acb8', merlon=6, gap=3)
    x = 2
    while x < W - 40:                               # the lane of houses
        bw = rnd.randint(30, 38)
        house(d, x, bw, GROUND - rnd.randint(34, 44), rnd)
        x += bw + rnd.randint(14, 30)
    for lx in (46, 130):
        rect(d, lx, 70, 2, GROUND - 70, '#3a3a44')
        orect(d, lx - 3, 64, 8, 7, '#f6d36b', '#3a3a44')
    rect(d, 0, GROUND - 2, W, 2, '#5b5a66')
    save(img, BG, 'castle-outskirts.png')


def hillside_bg():
    """The hillside outside the castle (scene 8): rolling meadows with wild
    flowers, a fence along the path and a stream below."""
    img, d = canvas(W, H)
    rnd = random.Random(51)
    for (y, amp, c, ph) in ((70, 10, '#8fbf7a', 0.0), (82, 8, '#78ad62', 1.7), (94, 6, '#64a050', 3.1)):
        pts = [(0, GROUND)] + [(x, y - amp * math.sin(x / 28 + ph) - amp * 0.5 * math.sin(x / 11 + ph)) for x in range(0, W + 1, 4)] + [(W, GROUND)]
        d.polygon(pts, fill=c)
    d.polygon([(150, GROUND), (178, 92), (200, 92), (210, GROUND)], fill='#7fb8e0')    # the stream
    d.line([(178, 92), (200, 92)], fill='#bfe0ff')
    for k in range(60):
        x, y = rnd.randint(0, W), rnd.randint(78, GROUND - 2)
        d.point((x, y), fill=rnd.choice(['#f2c94c', '#f08fc0', '#ffffff', '#e0453c']))
    for fx in range(4, 120, 12):                    # fence
        rect(d, fx, 92, 2, 14, '#8a5a32')
    rect(d, 4, 95, 116, 1, '#8a5a32')
    rect(d, 4, 100, 116, 1, '#8a5a32')
    save(img, BG, 'hillside.png')


def mountain_high():
    """High on the mountain (scenes 14-15): close, jagged cliffs streaked with
    snow above a sea of cloud."""
    img, d = canvas(W, H)
    for (cx, peak, half, rock, shade) in [(30, 18, 50, '#7b86a0', '#66708a'), (110, 4, 70, '#8592ad', '#6e7a96'),
                                          (200, 20, 56, '#7b86a0', '#66708a')]:
        d.polygon([(cx - half, GROUND), (cx - half * 0.4, peak + 30), (cx, peak), (cx + half * 0.5, peak + 24), (cx + half, GROUND)], fill=rock)
        d.polygon([(cx, peak), (cx + half * 0.5, peak + 24), (cx + half, GROUND), (cx + 8, GROUND)], fill=shade)
        d.polygon([(cx - 12, peak + 14), (cx, peak), (cx + 10, peak + 12), (cx + 2, peak + 9)], fill='#eef3f8')
        for k in range(4):
            y = peak + 30 + k * 16
            d.line([(cx - 10 + k * 4, y), (cx + 6 + k * 3, y + 6)], fill='#eef3f8')
    for k in range(7):                              # the sea of cloud
        x = k * 40 - 10
        d.ellipse([x, 86, x + 56, 112], fill=(246, 240, 236, 235))
    rect(d, 0, 98, W, 12, (246, 240, 236, 235))
    save(img, BG, 'mountain-high.png')


def wood_floor_tile(d):
    rect(d, 0, 0, 16, 16, '#7a5236')
    for y in (0, 5, 10, 15):
        rect(d, 0, y, 16, 1, '#4a3224')
    for (x, y) in ((6, 1), (12, 6), (3, 11)):
        rect(d, x, y, 1, 4, '#4a3224')
    rect(d, 1, 2, 3, 1, '#9a6a46')


def seer_bed(img, d):
    """FlowerGirl lying in the Seer's small bed, her own sprite laid down."""
    orect(d, 0, 14, 60, 12, '#e7d7c7', '#5e3d24')
    orect(d, 0, 6, 6, 26, '#8d6140', '#5e3d24')
    orect(d, 54, 10, 6, 22, '#8d6140', '#5e3d24')
    rect(d, 2, 32, 4, 2, '#5e3d24')
    rect(d, 54, 32, 4, 2, '#5e3d24')
    sheet = Image.open(os.path.join(HERE, 'ALL (PNG)', 'flowerling_spritesheet.png')).convert('RGBA')
    fg = sheet.crop((0, 0, 32, 46))
    fg = fg.crop(fg.getbbox()).rotate(90, expand=True)
    img.alpha_composite(fg, (6, max(0, 16 - fg.height // 2 - 2)))
    orect(d, 24, 14, 30, 12, '#8fa6d0', '#4a5a80')                # blanket
    rect(d, 24, 14, 30, 2, '#b8c8e8')


def cauldron(d):
    d.ellipse([2, 6, 22, 22], fill=OUT)
    d.ellipse([3, 7, 21, 21], fill='#3a3a44')
    d.ellipse([4, 5, 20, 10], fill='#5fd88a', outline=OUT)
    for (x, y) in ((8, 3), (13, 1), (16, 4)):
        d.ellipse([x, y, x + 2, y + 2], fill='#9fffc0')
    rect(d, 5, 21, 2, 3, OUT)
    rect(d, 17, 21, 2, 3, OUT)


def crystal_ball(d):
    orect(d, 3, 11, 8, 4, '#8a5a32')
    d.ellipse([1, 1, 13, 13], fill=OUT)
    d.ellipse([2, 2, 12, 12], fill='#9fe8ff')
    d.ellipse([4, 4, 7, 7], fill='#ffffff')


def herbs(d):
    d.line([(6, 0), (6, 5)], fill='#3a2a1c')
    d.polygon([(1, 5), (11, 5), (9, 18), (3, 18)], fill='#6fa64a', outline=OUT)
    rect(d, 4, 7, 4, 2, '#8fc65a')


def potion_shelf(d):
    rnd = random.Random(7)
    orect(d, 0, 0, 30, 40, '#6b4a36', '#3a261c')
    for sy in (12, 26, 38):
        rect(d, 1, sy, 28, 2, '#8d6140')
        x = 3
        while x < 26:
            w = rnd.choice([3, 4])
            h = rnd.randint(5, 8)
            orect(d, x, sy - h, w, h, rnd.choice(['#7fb8f0', '#b07fe0', '#7fe0a8', '#f08f8f', '#f2c94c']))
            x += w + 1


def town():
    """A town street beneath the World Tree: a row of complete timbered houses
    with tiled roofs, chimneys, windows and doors. Every house stands wholly
    inside the picture, with open space at both ends, so where the street
    begins or ends (or one copy meets the next) no house is ever cut in two."""
    img, d = canvas(W, H)
    rnd = random.Random(5)
    margin = 8
    x = margin
    while True:
        bw = rnd.randint(30, 40)
        if x + bw + 3 > W - margin:
            break
        house(d, x, bw, GROUND - rnd.randint(34, 50), rnd)
        x += bw + rnd.randint(4, 8)
    rect(d, 0, GROUND - 1, W, 2, '#8d7a6a')
    save(img, BG, 'town.png')


def mountains():
    """Distant snow-capped peaks for the pass and the climb."""
    img, d = canvas(W, H)
    for (cx, peak, half, rock, shade) in [
        (40, 22, 70, '#8592ad', '#6e7a96'), (150, 8, 90, '#7a87a3', '#66728d'),
        (235, 30, 60, '#8592ad', '#6e7a96'), (-20, 40, 60, '#7a87a3', '#66728d'),
    ]:
        base = GROUND
        d.polygon([(cx - half, base), (cx, peak), (cx + half, base)], fill=rock)
        d.polygon([(cx, peak), (cx + half, base), (cx + 6, base)], fill=shade)
        snow = peak + (base - peak) // 4
        d.polygon([(cx - (snow - peak) * half // (base - peak), snow), (cx, peak),
                   (cx + (snow - peak) * half // (base - peak), snow),
                   (cx + 4, snow - 3), (cx - 3, snow + 2), (cx - 8, snow - 2)], fill='#eef3f8')
    rect(d, 0, 96, W, 12, '#c9d6e6')   # low mist over the foothills
    for x in range(0, W, 9):
        rect(d, x, 94, 6, 2, '#c9d6e6')
    save(img, BG, 'mountains.png')


def world_tree():
    """The World Tree, far off, with the castle carved into its trunk."""
    img, d = canvas(120, 130)
    trunk, trunk_d, leaf, leaf_d, leaf_l = '#7c8f86', '#64776e', '#6ea48b', '#5a8f78', '#86bb9f'
    # roots and trunk
    d.polygon([(28, 129), (46, 92), (46, 58), (74, 58), (74, 92), (92, 129)], fill=trunk)
    d.polygon([(60, 58), (74, 58), (74, 92), (92, 129), (66, 129)], fill=trunk_d)
    # castle carved into the trunk
    for tx, ty, tw in ((50, 66, 8), (62, 62, 8), (56, 76, 10)):
        rect(d, tx, ty, tw, 128 - ty, '#c3ccd0')
        for m in range(tx, tx + tw, 3):
            rect(d, m, ty - 2, 2, 2, '#c3ccd0')
        d.polygon([(tx - 1, ty - 2), (tx + tw // 2, ty - 10), (tx + tw, ty - 2)], fill='#5b78a8')
        rect(d, tx + tw // 2 - 1, ty + 4, 2, 3, '#f6d36b')
    rect(d, 57, 110, 8, 19, '#4b3a2c')
    # canopy
    for (x0, y0, x1, y1, c) in [(4, 18, 60, 64, leaf_d), (60, 14, 118, 62, leaf_d), (14, 2, 104, 54, leaf),
                                (30, 0, 90, 30, leaf_l), (0, 34, 40, 66, leaf), (80, 30, 120, 64, leaf)]:
        d.ellipse([x0, y0, x1, y1], fill=c)
    for _ in range(40):
        rnd = random.Random(_)
        x, y = rnd.randint(10, 108), rnd.randint(6, 58)
        rect(d, x, y, 2, 2, leaf_l if _ % 2 else leaf_d)
    save(img, PROPS, 'world-tree.png')


# --- Forests (480x270: twice the detail of the other backgrounds) ------------

FW, FH, FGROUND = 480, 270, 216   # ground line at 80%, as everywhere else


def gradient(d, w, stops):
    """Vertical colour gradient through (y, (r, g, b)) stops."""
    for y in range(stops[0][0], stops[-1][0]):
        for (y0, c0), (y1, c1) in zip(stops, stops[1:]):
            if y0 <= y < y1:
                t = (y - y0) / max(1, y1 - y0)
                c = tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
                d.line([(0, y), (w, y)], fill=c)


def wrapped(w, x, draw):
    """Draw something at x and again one picture-width either side, so the
    picture tiles seamlessly."""
    for dx in (-w, 0, w):
        draw(x + dx)


def trunk(d, x, top, base, width, bark, shade, twist=0.0, phase=0.0, outline=OUT, flare=1.8):
    """A tree trunk from `top` to `base`, flaring into roots at the bottom and
    optionally twisting as it rises."""
    import math
    left, right = [], []
    for y in range(top, base + 1, 3):
        t = (y - top) / max(1, base - top)
        cx = x + twist * math.sin(phase + t * 5.0)
        half = width / 2 * (1 + (flare - 1) * max(0.0, t - 0.78) / 0.22)
        left.append((cx - half, y))
        right.append((cx + half, y))
    poly = left + right[::-1]
    d.polygon(poly, fill=bark, outline=outline)
    shade_poly = [((a[0] + b[0]) / 2 + 1, a[1]) for a, b in zip(left, right)] + right[::-1]
    d.polygon(shade_poly, fill=shade)
    for (lx, ly), (rx, _) in zip(left[2::6], right[2::6]):
        d.line([(lx + 2, ly), (lx + (rx - lx) * 0.45, ly + 2)], fill=shade)


def canopy(d, cx, cy, r, dark, mid, light, rnd, outline=OUT, spots=None):
    """A rounded mass of leaves built from overlapping clumps."""
    clumps = [(cx + rnd.randint(-r, r), cy + rnd.randint(-r // 2, r // 2), rnd.randint(r * 2 // 3, r)) for _ in range(6)]
    for x, y, rr in clumps:
        d.ellipse([x - rr - 1, y - rr * 3 // 4 - 1, x + rr + 1, y + rr * 3 // 4 + 1], fill=outline)
    for x, y, rr in clumps:
        d.ellipse([x - rr, y - rr * 3 // 4, x + rr, y + rr * 3 // 4], fill=dark)
    for x, y, rr in clumps:
        d.ellipse([x - rr + 3, y - rr * 3 // 4 + 1, x + rr - 5, y + rr * 3 // 4 - 5], fill=mid)
    for x, y, rr in clumps[:4]:
        d.ellipse([x - rr // 2, y - rr // 2, x + rr // 6, y - rr // 8], fill=light)
    for _ in range(r):
        x, y = cx + rnd.randint(-r, r), cy + rnd.randint(-r // 2, r // 2)
        d.rectangle([x, y, x + 1, y + 1], fill=(spots or light) if rnd.random() < 0.5 else dark)


def forest(name, sky, far, light_rays, bark, canopy_colours, under, flowers, glow=None, twist=0.0, seed=1):
    img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    rnd = random.Random(seed)
    gradient(d, FW, sky)
    # far trees: pale, low contrast, no outline - depth
    for i in range(16):
        x = i * FW // 16 + rnd.randint(-6, 6)
        w, ph = rnd.randint(6, 10), rnd.random() * 6
        wrapped(FW, x, lambda xx: trunk(d, xx, 40, FGROUND, w, far[0], far[0], twist * 0.4, ph, outline=far[0], flare=1.3))
    for i in range(12):
        x = i * FW // 12 + rnd.randint(-10, 10)
        r, cy = rnd.randint(30, 42), rnd.randint(18, 56)
        wrapped(FW, x, lambda xx: canopy(d, xx, cy, r, far[1], far[1], far[2], random.Random(i + seed), outline=far[1]))
    # light falling through the leaves
    for i in range(5):
        x = i * FW // 5 + 30
        wrapped(FW, x, lambda xx: d.polygon([(xx, 0), (xx + 22, 0), (xx + 92, FGROUND), (xx + 52, FGROUND)], fill=light_rays))
    # middle trees
    dark, mid, lightc = canopy_colours
    mids = [(30 + i * FW // 6 + rnd.randint(-12, 12), rnd.randint(14, 22)) for i in range(6)]
    for x, w in mids:
        ph = rnd.random() * 6
        wrapped(FW, x, lambda xx: trunk(d, xx, 30, FGROUND + 2, w, bark[0], bark[1], twist, ph))
        if glow:
            # glowing veins climbing the twisted trunks
            for k in range(4):
                y = 70 + k * 34
                wrapped(FW, x, lambda xx: d.line([(xx - w // 3, y), (xx + w // 4, y + 12), (xx - w // 5, y + 24)], fill=glow[:3] + (130,), width=1))
    for x, _ in mids:
        r, cy = rnd.randint(40, 52), rnd.randint(20, 46)
        wrapped(FW, x, lambda xx: canopy(d, xx, cy, r, dark, mid, lightc, random.Random(x), spots=flowers[0] if glow else None))
    # underbrush along the ground line
    for i in range(22):
        x = i * FW // 22 + rnd.randint(-4, 4)
        rr = rnd.randint(12, 20)
        wrapped(FW, x, lambda xx: (d.ellipse([xx - rr - 1, FGROUND - rr - 1, xx + rr + 1, FGROUND + rr // 2], fill=OUT),
                                     d.ellipse([xx - rr, FGROUND - rr, xx + rr, FGROUND + rr // 2], fill=under[0]),
                                     d.ellipse([xx - rr + 3, FGROUND - rr + 2, xx + rr // 3, FGROUND - rr // 3], fill=under[1])))
    for i in range(30):
        x, y = rnd.randint(0, FW - 3), FGROUND - rnd.randint(4, 16)
        c = flowers[i % len(flowers)]
        d.rectangle([x, y, x + 2, y + 2], fill=c)
    if glow:
        for i in range(40):
            x, y = rnd.randint(0, FW - 2), rnd.randint(60, FGROUND - 20)
            d.rectangle([x, y, x + 1, y + 1], fill=glow)
    d.rectangle([0, FGROUND - 1, FW, FGROUND + 1], fill=under[0])
    img.save(os.path.join(BG, name))
    print('wrote', 'environment/backgrounds/' + name)


def deep_forest():
    """The deep forest at late afternoon: old trees, golden light slanting
    through the leaves, ferns and bushes (scenes 3-5)."""
    forest('deep-forest.png',
           sky=[(0, (34, 74, 52)), (110, (88, 140, 92)), (180, (190, 214, 140)), (FGROUND + 2, (226, 222, 160))],
           far=('#7fa982', '#6f9c78', '#8fb98f'),
           light_rays=(255, 236, 170, 38),
           bark=('#6b4f36', '#543d2a'),
           canopy_colours=('#245a34', '#33773f', '#5da24f'),
           under=('#2c6a38', '#4c9447'),
           flowers=['#f2c94c', '#f08fc0', '#ffffff'],
           seed=21)


def column_forest(name, sky, far, trunk, shade_c, edge, ground, seed=1, extra=None):
    """A forest of tall, straight trunks rising out of frame, as the storyboard
    draws the enchanted and water forests: pale far trunks for depth, nearer
    trunks with a lit edge, undergrowth along the ground line."""
    img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    rnd = random.Random(seed)
    gradient(d, FW, sky)
    for i in range(16):
        x, w = i * FW // 16 + rnd.randint(-6, 6), rnd.randint(5, 9)
        wrapped(FW, x, lambda xx, w=w: d.rectangle([xx - w // 2, 0, xx + w // 2, FGROUND], fill=far))
    mids = [(20 + i * FW // 7 + rnd.randint(-14, 14), rnd.randint(16, 30)) for i in range(7)]
    for x, w in mids:
        def column(xx, w=w):
            d.rectangle([xx - w // 2 - 1, 0, xx + w // 2 + 1, FGROUND + 2], fill=OUT)
            d.rectangle([xx - w // 2, 0, xx + w // 2, FGROUND + 2], fill=trunk)
            d.rectangle([xx + w // 6, 0, xx + w // 2, FGROUND + 2], fill=shade_c)
            d.rectangle([xx - w // 2, 0, xx - w // 2 + 1, FGROUND + 2], fill=edge)
            for y in range(12, FGROUND, 26):
                d.line([(xx - w // 4, y), (xx - w // 6, y + 8)], fill=shade_c)
            d.polygon([(xx - w // 2 - 6, FGROUND + 2), (xx - w // 2, FGROUND - 10), (xx + w // 2, FGROUND - 10),
                       (xx + w // 2 + 6, FGROUND + 2)], fill=trunk)
        wrapped(FW, x, column)
    if extra:
        extra(d, rnd, mids)
    for i in range(24):
        x, rr = i * FW // 24 + rnd.randint(-4, 4), rnd.randint(10, 17)

        def tuft(xx, rr=rr):
            d.ellipse([xx - rr - 1, FGROUND - rr - 1, xx + rr + 1, FGROUND + rr // 2], fill=OUT)
            d.ellipse([xx - rr, FGROUND - rr, xx + rr, FGROUND + rr // 2], fill=ground[0])
            d.ellipse([xx - rr + 3, FGROUND - rr + 2, xx + rr // 3, FGROUND - rr // 3], fill=ground[1])
        wrapped(FW, x, tuft)
    d.rectangle([0, FGROUND - 1, FW, FGROUND + 1], fill=ground[0])
    img.save(os.path.join(BG, name))
    print('wrote', 'environment/backgrounds/' + name)


def enchanted_forest():
    """The enchanted forest as the storyboard draws it (frames 50-57): tall
    straight trunks crossed by thorny branches, shimmering leaves and glowing
    pollen in the air (scene 12)."""
    def thorns(d, rnd, mids):
        for k in range(5):
            y = 30 + k * 34 + rnd.randint(-8, 8)
            x0 = rnd.randint(0, FW)
            span = rnd.randint(140, 220)

            def branch(xx, y=y, span=span, k=k):
                pts = [(xx + t * span / 8, y + 6 * math.sin(t * 0.9 + k)) for t in range(9)]
                d.line(pts, fill=OUT, width=5)
                d.line(pts, fill='#6e5070', width=3)
                for (ax, ay) in pts[1:-1:2]:
                    d.polygon([(ax - 3, ay - 1), (ax, ay - 7), (ax + 3, ay - 1)], fill='#4a3450')
                    d.polygon([(ax + 4, ay + 1), (ax + 7, ay + 7), (ax + 10, ay + 1)], fill='#4a3450')
                for (ax, ay) in pts[::3]:
                    d.ellipse([ax - 5, ay - 9, ax + 5, ay - 1], fill='#2f8f86')
            wrapped(FW, x0, branch)
        for _ in range(70):
            x, y = rnd.randint(0, FW - 2), rnd.randint(10, FGROUND - 20)
            d.rectangle([x, y, x + 1, y + 1], fill=rnd.choice([(170, 255, 220, 230), (255, 170, 230, 220)]))
    column_forest('enchanted-forest.png',
                  sky=[(0, (28, 40, 78)), (110, (56, 118, 128)), (190, (150, 226, 204)), (FGROUND + 2, (196, 244, 222))],
                  far=(84, 104, 140), trunk=(96, 76, 132), shade_c=(72, 56, 104), edge=(150, 240, 210),
                  ground=((36, 96, 92), (60, 140, 120)), seed=33, extra=thorns)


def water_forest():
    """The water forest (frames 58-63): pale, straight-trunked trees around
    still water, mist low over the ground (scene 13)."""
    def mist(d, rnd, mids):
        for k in range(3):
            y = FGROUND - 30 + k * 10
            d.rectangle([0, y, FW, y + 8], fill=(236, 246, 250, 70))
        for _ in range(30):
            x, y = rnd.randint(0, FW - 2), rnd.randint(40, FGROUND - 30)
            d.rectangle([x, y, x + 1, y + 1], fill=(255, 255, 255, 200))
    column_forest('water-forest.png',
                  sky=[(0, (138, 202, 226)), (140, (196, 232, 242)), (FGROUND + 2, (226, 246, 250))],
                  far=(184, 218, 230), trunk=(150, 196, 214), shade_c=(122, 170, 196), edge=(240, 252, 255),
                  ground=((92, 160, 128), (130, 196, 150)), seed=44, extra=mist)


def city_night():
    """The city streets at night in the storm (scene 9): rows of houses with
    lit windows under a dark sky, on the way to the grand library."""
    img, d = canvas(W, H)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(24 + 30 * t), int(30 + 34 * t), int(58 + 40 * t), 255))
    rnd = random.Random(9)
    town_img, td = canvas(W, H)
    x = 4
    while x < W - 36:
        bw = rnd.randint(30, 40)
        house(td, x, bw, GROUND - rnd.randint(40, 58), rnd)
        x += bw + rnd.randint(2, 5)
    px = town_img.load()
    for yy in range(H):
        for xx in range(W):
            r, g, b, a = px[xx, yy]
            if not a:
                continue
            if (r, g, b) == (0x5b, 0x7f, 0xa8):
                px[xx, yy] = (246, 211, 107, 255)            # lit windows
            else:
                px[xx, yy] = (int(r * 0.42), int(g * 0.46), int(b * 0.66), a)
    img.alpha_composite(town_img)
    rect(d, 0, GROUND - 1, W, 2, (60, 62, 76))
    save(img, BG, 'city-night.png')


# --- Houses for the rooftop chase, and castle pieces that join the scenes ------

def house_gable(cols):
    """The pitched roof of a town house the player runs across: it stands on
    the house's eaves, behind the player, so the building reads as whole."""
    w = cols * 16
    h = w * 5 // 16
    img, d = canvas(w, h + 14)
    top = 14
    cx = w * 7 // 10
    slope = lambda x: top + (h - 1) * abs(x - w / 2) / (w / 2)
    cy = int(slope(cx + 3))
    orect(d, cx, cy - 12, 8, 16, '#8d6a5a')
    rect(d, cx - 1, cy - 13, 10, 2, '#6d4a3a')
    d.polygon([(0, top + h - 1), (w // 2, top), (w - 1, top + h - 1)], fill='#a9483a', outline=OUT)
    for y in range(top + 4, top + h - 1, 4):
        half = (y - top) * (w // 2) // (h - 1)
        rect(d, w // 2 - half + 1, y, 2 * half - 2, 1, '#7f3328')
    # round attic window
    d.ellipse([w // 2 - 5, top + h // 2 - 3, w // 2 + 5, top + h // 2 + 7], fill=OUT)
    d.ellipse([w // 2 - 4, top + h // 2 - 2, w // 2 + 4, top + h // 2 + 6], fill='#5b7fa8')
    rect(d, w // 2, top + h // 2 - 2, 1, 9, OUT)
    save(img, PROPS, f'house-gable-{cols}.png')


def house_door(d):
    orect(d, 0, 0, 14, 22, '#5a3a1c')
    orect(d, 2, 2, 10, 20, '#7a4a2a')
    rect(d, 6, 3, 2, 18, '#5a3a1c')
    rect(d, 9, 12, 1, 2, '#e8b83c')
    rect(d, 0, 21, 14, 1, '#8d7a6a')


def castle_tower(d):
    """A whole round-fronted tower, ground to battlements and cone roof."""
    w, h = 44, 240
    stone_wall(d, 2, 40, w - 2, h, '#97a0ad', '#717a88', '#b3bbc6', bw=10, bh=6, rnd=random.Random(9))
    rect(d, 2, 40, 1, h - 40, OUT)
    rect(d, w - 3, 40, 1, h - 40, OUT)
    crenellations(d, 0, w, 44, '#a3acb8', merlon=7, gap=3)
    d.polygon([(4, 38), (w // 2, 2), (w - 5, 38)], fill='#5b78a8', outline=OUT)
    d.polygon([(w // 2, 2), (w - 5, 38), (w // 2 + 2, 38)], fill='#4a6590')
    for wy in (70, 120, 170):
        rect(d, w // 2 - 3, wy, 6, 12, OUT)
        rect(d, w // 2 - 2, wy + 1, 4, 10, '#2c3550')


def castle_doorway(d):
    """A section of castle wall with an open arched doorway at its foot: the
    way in from the courtyard to the hall."""
    w, h = 56, 240
    stone_wall(d, 0, 6, w, h, '#8d8a9a', '#6c6979', '#a7a4b3', rnd=random.Random(13))
    crenellations(d, 0, w, 10, '#9a97a7')
    rect(d, 0, 6, 1, h, OUT)
    rect(d, w - 1, 6, 1, h, OUT)
    # arch opening (the floor of the hall is 32 px above the bottom)
    ox, ow, oy = 12, 32, h - 32 - 44
    rect(d, ox - 2, oy + 12, ow + 4, 44 - 12, '#5d5a6b')
    d.pieslice([ox - 2, oy - 2, ox + ow + 2, oy + 26], 180, 360, fill='#5d5a6b')
    rect(d, ox, oy + 12, ow, 44 - 12, '#2a2533')
    d.pieslice([ox, oy, ox + ow, oy + 24], 180, 360, fill='#2a2533')
    rect(d, ox + 4, oy + 18, ow - 8, 26, '#e8b86a')       # torchlight from the hall
    rect(d, ox + 8, oy + 14, ow - 16, 4, '#e8b86a')
    # banner above the door
    d.polygon([(w // 2 - 5, oy - 40), (w // 2 + 5, oy - 40), (w // 2 + 5, oy - 14), (w // 2, oy - 18), (w // 2 - 5, oy - 14)], fill='#b23a35', outline=OUT)
    rect(d, w // 2 - 2, oy - 34, 4, 4, '#e8b83c')


def room_doorway(d):
    """An inner wall with a carved wooden door frame, standing open: the way
    from the hall into the Princess's room."""
    w, h = 40, 240
    stone_wall(d, 0, 0, w, h, '#6f6878', '#585261', '#857e8e', bw=14, bh=7, rnd=random.Random(17))
    rect(d, 0, 0, 1, h, OUT)
    rect(d, w - 1, 0, 1, h, OUT)
    ox, ow, oh = 8, 24, 40
    oy = h - 32 - oh
    orect(d, ox - 3, oy - 6, ow + 6, oh + 6, '#7a4a2a')
    d.pieslice([ox - 3, oy - 14, ox + ow + 3, oy + 2], 180, 360, fill='#7a4a2a', outline=OUT)
    rect(d, ox, oy, ow, oh, '#3a2c3a')
    rect(d, ox + 2, oy + 2, ow - 4, oh - 2, '#f0d8c0')     # the lit room beyond
    orect(d, ox, oy, 7, oh, '#8a5a32')                    # door swung open
    rect(d, ox + 5, oy + oh // 2, 1, 2, '#e8b83c')


# --- Props drawn to match the storyboard -----------------------------------------

def city_gate(d):
    """The arched gate in the city wall that the kid runs out through, the
    forest beyond it (frame 05)."""
    w, h = 90, 120
    for y in range(14, h, 8):
        off = 6 if (y // 8) % 2 else 0
        for x in range(-off, w, 12):
            orect(d, max(0, x), y, min(12, w - max(0, x)), 8, '#9a97a7', '#6c6979')
    for x in range(0, w, 12):
        orect(d, x, 6, 8, 10, '#9a97a7', '#6c6979')
    d.rectangle([24, 52, 66, h], fill='#6c6979')
    d.pieslice([24, 32, 66, 74], 180, 360, fill='#6c6979')
    d.rectangle([28, 56, 62, h], fill='#a6d68a')
    d.pieslice([28, 36, 62, 76], 180, 360, fill='#a6d68a')
    d.rectangle([28, 96, 62, h], fill='#7ab65e')
    for tx in (34, 44, 54):
        d.rectangle([tx, 70, tx + 2, 100], fill='#6b4426')
        d.ellipse([tx - 6, 58, tx + 8, 74], fill='#4f9a4a')
    d.polygon([(66, 52), (84, 44), (84, h), (66, h)], fill='#7a4a2a', outline=OUT)
    for y in range(58, h, 14):
        d.line([(67, y), (83, y - 6)], fill='#5a3a1c')


def stone_pillar(d):
    orect(d, 1, 0, 16, 6, '#a7a4b3')
    orect(d, 3, 6, 12, 66, '#8d8a9a')
    rect(d, 5, 7, 2, 64, '#a7a4b3')
    rect(d, 11, 7, 3, 64, '#6c6979')
    orect(d, 0, 72, 18, 8, '#a7a4b3')


def twig(d):
    d.line([(1, 6), (12, 4), (24, 5)], fill=OUT, width=3)
    d.line([(1, 6), (12, 4), (24, 5)], fill='#8a5a32', width=1)
    d.line([(9, 4), (14, 0)], fill='#8a5a32', width=1)


def music_note(d):
    d.ellipse([0, 6, 5, 10], fill='#fff7e0')
    rect(d, 4, 0, 1, 8, '#fff7e0')
    d.polygon([(5, 0), (8, 2), (5, 3)], fill='#fff7e0')


def thorn_vine(d):
    pts = [(x, 9 + 4 * math.sin(x / 14)) for x in range(0, 121, 4)]
    d.line(pts, fill=OUT, width=5)
    d.line(pts, fill='#6e5070', width=3)
    for i, (x, y) in enumerate(pts[1:-1:3]):
        d.polygon([(x - 2, y - 1), (x, y - 6), (x + 2, y - 1)], fill='#4a3450')
        d.polygon([(x + 3, y + 1), (x + 5, y + 6), (x + 7, y + 1)], fill='#4a3450')
        if i % 2 == 0:
            d.ellipse([x - 3, y - 8, x + 3, y - 2], fill='#2f8f86')


def canopy_bed(d):
    """A four-poster bed with curtains (frame 82)."""
    wood = '#7a4a2a'
    for x in (2, 57):
        orect(d, x, 4, 5, 52, wood)
    orect(d, 0, 0, 64, 7, wood)
    d.polygon([(7, 7), (20, 7), (10, 40), (7, 40)], fill='#e6b4cc', outline=OUT)
    d.polygon([(57, 7), (44, 7), (54, 40), (57, 40)], fill='#e6b4cc', outline=OUT)
    orect(d, 6, 30, 52, 14, '#f2e8ee')
    orect(d, 8, 26, 14, 8, '#ffffff')
    orect(d, 20, 32, 38, 12, '#c98aa8')
    orect(d, 4, 44, 56, 8, wood)


def glass_dome(img, d):
    """The Undying Flower - the very same picture - kept under a glass dome
    in the Princess's room (frame 83)."""
    flower, fd = canvas(16, 22)
    undying_flower(fd)
    img.alpha_composite(flower, (3, 4))
    orect(d, 0, 26, 22, 4, '#8a5a32')
    glass, g = canvas(22, 30)                 # the glass, laid over the flower
    g.rectangle([2, 8, 19, 26], fill=(200, 230, 255, 70))
    g.pieslice([2, 0, 19, 16], 180, 360, fill=(200, 230, 255, 70))
    g.arc([2, 0, 19, 16], 180, 360, fill=(240, 250, 255, 220))
    g.line([(2, 8), (2, 26)], fill=(240, 250, 255, 220))
    g.line([(19, 8), (19, 26)], fill=(240, 250, 255, 220))
    g.line([(4, 6), (4, 22)], fill=(255, 255, 255, 200))
    img.alpha_composite(glass)


def potted_plant(d):
    orect(d, 3, 12, 9, 8, '#a0603a')
    for (x0, y0, x1, y1) in ((0, 2, 8, 12), (6, 0, 14, 11), (3, 5, 11, 14)):
        d.ellipse([x0, y0, x1, y1], fill='#4f9a4a', outline=OUT)


def library_facade(d):
    """The front of the grand library: stone, tall arched windows, and the
    great doors thrown open with lamplight inside (frame 36)."""
    w, h = 100, 230
    for y in range(0, h, 8):
        off = 6 if (y // 8) % 2 else 0
        for x in range(-off, w, 12):
            orect(d, max(0, x), y, min(12, w - max(0, x)), 8, '#8a7a74', '#5d504c')
    for wx in (14, 66):
        d.rectangle([wx, 70, wx + 20, 120], fill=OUT)
        d.pieslice([wx, 60, wx + 20, 80], 180, 360, fill=OUT)
        d.rectangle([wx + 2, 72, wx + 18, 118], fill='#f6d36b')
        d.pieslice([wx + 2, 62, wx + 18, 82], 180, 360, fill='#f6d36b')
        rect(d, wx + 9, 64, 2, 56, OUT)
    d.rectangle([28, 160, 72, h], fill='#4a3a30')
    d.pieslice([28, 140, 72, 184], 180, 360, fill='#4a3a30')
    d.rectangle([33, 166, 67, h], fill='#ffdc9a')
    d.pieslice([33, 146, 67, 188], 180, 360, fill='#ffdc9a')
    d.polygon([(33, 166), (24, 162), (24, h), (33, h)], fill='#7a4a2a', outline=OUT)
    d.polygon([(67, 166), (76, 162), (76, h), (67, h)], fill='#7a4a2a', outline=OUT)
    orect(d, 20, 130, 60, 8, '#a89890')


def tall_grass(d):
    rnd = random.Random(2)
    for i in range(14):
        x = 3 + i * 2.6
        top = rnd.randint(0, 10)
        lean = rnd.randint(-5, 5)
        d.line([(x, 25), (x + lean, top + 6)], fill=rnd.choice(['#6f9e3a', '#8fbf4a', '#a9c95a']), width=2)
        if i % 3 == 0:
            d.ellipse([x + lean - 2, top, x + lean + 2, top + 7], fill='#d9c27a')


def dust_cloud(d):
    for (x0, y0, x1, y1) in ((0, 8, 18, 20), (10, 2, 30, 20), (22, 6, 40, 20)):
        d.ellipse([x0, y0, x1, y1], fill=(210, 200, 186, 210))


def cloud_sea(d):
    rnd = random.Random(5)
    for i in range(14):
        x = i * 12 + rnd.randint(-3, 3)
        r = rnd.randint(8, 14)
        d.ellipse([x - r, 24 - r * 1.4, x + r, 24], fill=(246, 240, 236, 235))
    d.rectangle([0, 18, 160, 24], fill=(246, 240, 236, 235))


# --- Obstacle tiles (16x16, same outline style as the provided tileset) ---------

def tile(name, draw):
    img, d = canvas(16, 16)
    draw(d)
    save(img, TILES, name + '.png')


def roof_tile(d):
    rect(d, 0, 0, 16, 16, '#a9483a')
    rect(d, 0, 0, 16, 1, OUT)
    rect(d, 0, 1, 16, 2, '#c25d47')
    for y in (5, 10, 15):
        rect(d, 0, y, 16, 1, '#7f3328')
    for y, off in ((1, 0), (6, 4), (11, 0)):
        for x in range(off, 16, 8):
            rect(d, x, y, 1, 4, '#7f3328')


def house_wall_tile(d):
    rect(d, 0, 0, 16, 16, '#e8d3a8')
    rect(d, 0, 0, 2, 16, '#6b4426')
    rect(d, 0, 7, 16, 2, '#6b4426')
    rect(d, 9, 2, 5, 4, '#5b7fa8')
    rect(d, 9, 2, 5, 1, '#3a2418')
    rect(d, 3, 11, 1, 1, '#c9ae80')
    rect(d, 12, 12, 2, 1, '#c9ae80')


def castle_block_tile(d):
    rect(d, 0, 0, 16, 16, '#7d7a8c')
    for y in (0, 8):
        rect(d, 0, y, 16, 1, '#5d5a6b')
    rect(d, 7, 1, 1, 7, '#5d5a6b')
    rect(d, 3, 9, 1, 7, '#5d5a6b')
    rect(d, 12, 9, 1, 7, '#5d5a6b')
    rect(d, 0, 1, 7, 1, '#9895a7')
    rect(d, 8, 1, 8, 1, '#9895a7')
    rect(d, 4, 9, 8, 1, '#9895a7')


def carpet_tile(d):
    castle_block_tile(d)
    rect(d, 0, 0, 16, 1, OUT)
    rect(d, 0, 1, 16, 4, '#a3283a')
    rect(d, 0, 2, 16, 1, '#e8b83c')
    rect(d, 0, 5, 16, 1, '#6e1a27')


def bookshelf_tile(d):
    rect(d, 0, 0, 16, 16, '#3a2418')
    rect(d, 1, 1, 14, 14, '#6b4630')
    rnd = random.Random(2)
    for sy in (1, 8):
        x = 2
        while x < 14:
            bw = rnd.choice([1, 2])
            bh = rnd.randint(4, 6)
            rect(d, x, sy + 6 - bh, bw, bh, rnd.choice(['#9c2f3a', '#2f5a9c', '#3f7a3c', '#c9952e', '#6b3f8f']))
            x += bw + (1 if rnd.random() < 0.2 else 0)
        rect(d, 1, sy + 6, 14, 1, '#3a2418')


def barrel_tile(d):
    rect(d, 2, 0, 12, 16, OUT)
    rect(d, 1, 2, 14, 12, OUT)
    rect(d, 3, 1, 10, 14, '#a8703c')
    rect(d, 2, 3, 12, 10, '#a8703c')
    rect(d, 4, 1, 2, 14, '#c58a4f')
    for y in (3, 12):
        rect(d, 2, y, 12, 1, '#5a5f66')
    rect(d, 2, 7, 12, 2, '#8a5a2e')


def snow_rock_tile(d):
    rect(d, 0, 0, 16, 16, OUT)
    rect(d, 1, 1, 14, 14, '#8a8a96')
    rect(d, 1, 1, 14, 1, '#b4b4c0')
    rect(d, 4, 4, 8, 8, '#7a7a86')
    rect(d, 0, 0, 16, 4, '#eef3f8')
    rect(d, 0, 4, 3, 2, '#eef3f8')
    rect(d, 7, 4, 4, 1, '#eef3f8')
    rect(d, 13, 4, 3, 2, '#eef3f8')
    rect(d, 0, 0, 16, 1, '#c9d6e6')


def log_tile(d):
    rect(d, 0, 2, 16, 13, OUT)
    rect(d, 0, 3, 16, 11, '#7a4f2c')
    rect(d, 0, 4, 16, 2, '#9a6a3c')
    for x in (3, 9, 13):
        rect(d, x, 7, 2, 1, '#5a3a1c')
    rect(d, 0, 12, 16, 2, '#5a3a1c')
    rect(d, 6, 1, 3, 2, '#4f8a3a')   # moss


# --- Props --------------------------------------------------------------------------

def rich_prop(name, w, h, draw):
    """A prop whose drawing also composites images (it gets the canvas too)."""
    img, d = canvas(w, h)
    draw(img, d)
    save(img, PROPS, name + '.png')


def prop(name, w, h, draw):
    img, d = canvas(w, h)
    draw(d)
    save(img, PROPS, name + '.png')


def flower_stem(d):
    rect(d, 2, 0, 1, 14, '#3f8a34')
    rect(d, 3, 6, 2, 1, '#4fa83f')
    rect(d, 4, 5, 1, 1, '#4fa83f')
    rect(d, 0, 9, 2, 1, '#4fa83f')


def flower_head(petal, centre):
    def draw(d):
        rect(d, 2, 0, 3, 1, OUT)
        rect(d, 1, 1, 5, 4, OUT)
        rect(d, 2, 1, 3, 4, petal)
        rect(d, 1, 2, 5, 2, petal)
        rect(d, 3, 2, 1, 2, centre)
    return draw


def torch(d):
    rect(d, 2, 4, 4, 2, '#3a3a44')
    rect(d, 3, 6, 2, 9, '#6b4426')
    rect(d, 1, 3, 6, 2, '#5a5f66')


def flame(d):
    rect(d, 2, 1, 2, 1, '#ffd36b')
    rect(d, 1, 2, 4, 3, '#ff9a2e')
    rect(d, 2, 2, 2, 3, '#ffe28a')
    rect(d, 1, 5, 4, 1, '#e8601c')


def lamp_post(d):
    rect(d, 4, 10, 2, 40, '#3a3a44')
    rect(d, 2, 48, 6, 2, '#3a3a44')
    orect(d, 1, 3, 8, 8, '#f6d36b', '#3a3a44')
    rect(d, 2, 1, 6, 2, '#3a3a44')


def banner(d):
    rect(d, 0, 0, 12, 2, '#5a3a1c')
    d.polygon([(1, 2), (10, 2), (10, 26), (6, 22), (1, 26)], fill='#b23a35', outline=OUT)
    rect(d, 4, 7, 4, 4, '#e8b83c')
    rect(d, 5, 8, 2, 2, '#b23a35')


def vine(d):
    rnd = random.Random(4)
    for x in (2, 5, 8):
        h = rnd.randint(14, 22)
        rect(d, x, 0, 1, h, '#3f7a30')
        for y in range(2, h, 4):
            rect(d, x + (1 if y % 8 else -1), y, 2, 2, '#58a046')


def gate(d):
    # stone gatehouse arch with a closed portcullis and wooden doors behind
    rect(d, 0, 0, 56, 60, OUT)
    rect(d, 1, 1, 54, 58, '#8d8a9a')
    for y in range(1, 60, 6):
        rect(d, 1, y, 54, 1, '#6c6979')
    d.pieslice([8, 10, 47, 49], 180, 360, fill=OUT)
    rect(d, 8, 29, 40, 31, OUT)
    d.pieslice([9, 11, 46, 48], 180, 360, fill='#6b4426')
    rect(d, 9, 29, 38, 31, '#6b4426')
    for x in range(12, 46, 6):
        rect(d, x, 14, 2, 46, '#3a3a44')
    for y in range(22, 60, 7):
        rect(d, 9, y, 38, 2, '#3a3a44')
    for m in range(0, 56, 9):
        orect(d, m, -1, 6, 5, '#9a97a7')


def market_stall(d):
    # striped awning on two posts over a counter
    rect(d, 2, 10, 2, 26, '#6b4426')
    rect(d, 40, 10, 2, 26, '#6b4426')
    d.polygon([(0, 10), (4, 2), (40, 2), (44, 10)], fill=OUT)
    for i, x in enumerate(range(1, 43, 6)):
        rect(d, x, 3, 6, 7, '#d8443c' if i % 2 == 0 else '#f2ead6')
    for x in range(1, 43, 6):
        d.polygon([(x, 10), (x + 6, 10), (x + 3, 13)], fill='#d8443c' if (x // 6) % 2 == 0 else '#f2ead6')
    orect(d, 0, 26, 44, 10, '#9a6a3c')
    for x, c in ((6, '#e05a3a'), (12, '#f2c94c'), (18, '#7bbf4a'), (26, '#e05a3a'), (32, '#a35bd6')):
        d.ellipse([x, 22, x + 4, 26], fill=c)


def training_dummy(d):
    rect(d, 9, 10, 2, 30, '#6b4426')
    rect(d, 2, 16, 16, 2, '#6b4426')
    orect(d, 5, 14, 10, 14, '#d9b97a', '#6b4426')
    d.ellipse([5, 2, 15, 12], fill='#d9b97a', outline='#6b4426')
    rect(d, 7, 20, 6, 1, '#9c2f3a')
    rect(d, 6, 38, 8, 2, '#5a3a1c')


def big_tree(d):
    rect(d, 22, 30, 12, 50, OUT)
    rect(d, 23, 30, 10, 50, '#6b4426')
    rect(d, 24, 30, 3, 50, '#8a5a32')
    d.polygon([(14, 80), (23, 70), (23, 80)], fill='#6b4426')
    d.polygon([(42, 80), (33, 70), (33, 80)], fill='#5a3a1c')
    for (x0, y0, x1, y1, c) in [(0, 10, 34, 44, '#3f8a3a'), (22, 8, 56, 44, '#3f8a3a'), (6, 0, 50, 34, '#58a046'),
                                (14, 2, 36, 18, '#6fbf55')]:
        d.ellipse([x0, y0, x1, y1], fill=c)


def white_tree(d):
    rect(d, 12, 20, 8, 60, OUT)
    rect(d, 13, 20, 6, 60, '#eef1f4')
    for y in (28, 40, 52, 66):
        rect(d, 13, y, 3, 1, '#4a4a55')
    d.line([(16, 30), (4, 18)], fill='#eef1f4', width=2)
    d.line([(16, 36), (28, 22)], fill='#eef1f4', width=2)
    for (x0, y0, x1, y1) in [(0, 0, 22, 20), (12, 2, 32, 22), (4, 10, 28, 30)]:
        d.ellipse([x0, y0, x1, y1], fill='#8fd6e8')
    rect(d, 8, 6, 2, 2, '#c9f2fb')
    rect(d, 20, 12, 2, 2, '#c9f2fb')


def bush(d):
    for (x0, y0, x1, y1, c) in [(0, 6, 18, 22, '#2f7a3a'), (10, 0, 30, 22, '#3f8a3a'), (22, 6, 40, 22, '#2f7a3a'),
                                (8, 4, 20, 14, '#58a046')]:
        d.ellipse([x0, y0, x1, y1], fill=c)
    rect(d, 2, 20, 36, 2, '#2a5a2c')


def glow_root(d):
    # a root creeping along the ground, lit from inside
    pts = [(0, 6), (10, 4), (20, 7), (30, 3), (40, 6)]
    d.line(pts, fill='#2a5a52', width=4)
    d.line(pts, fill='#5fd8b4', width=2)
    d.line([(8, 5), (12, 1)], fill='#5fd8b4', width=1)
    d.line([(26, 4), (29, 0)], fill='#5fd8b4', width=1)
    for x, y in ((4, 4), (13, 4), (21, 6), (31, 2), (38, 5)):
        rect(d, x, y, 2, 2, '#e8fff6')


def glow_mushroom(d):
    rect(d, 4, 6, 2, 6, '#e8e0f0')
    d.ellipse([0, 0, 10, 8], fill='#7a5bd6')
    rect(d, 2, 2, 2, 2, '#c9b8ff')
    rect(d, 6, 3, 1, 1, '#c9b8ff')


def firefly(d):
    rect(d, 1, 1, 2, 2, '#fff7a8')
    rect(d, 0, 1, 1, 2, '#ffe36b')
    rect(d, 3, 1, 1, 2, '#ffe36b')


def pollen(d):
    rect(d, 1, 1, 2, 2, '#ffd6f2')
    rect(d, 0, 1, 1, 2, '#ff9ad6')
    rect(d, 3, 1, 1, 2, '#ff9ad6')


def mist(d):
    for x in range(0, 120, 2):
        alpha = 70 if 10 < x < 110 else 35
        rect(d, x, 3, 2, 6, (226, 240, 250, alpha))
    for x in range(10, 110, 2):
        rect(d, x, 1, 2, 2, (226, 240, 250, 40))


def moon(d):
    d.ellipse([0, 0, 15, 15], fill='#f6f1c9')
    d.ellipse([4, 3, 8, 7], fill='#e2dcae')
    d.ellipse([9, 9, 12, 12], fill='#e2dcae')


def candle(d):
    orect(d, 1, 4, 4, 8, '#f2ead6')
    rect(d, 0, 11, 6, 2, '#c9952e')


def table(d):
    orect(d, 0, 0, 30, 4, '#8a5a32', '#3a2418')
    rect(d, 2, 4, 3, 10, '#5a3a1c')
    rect(d, 25, 4, 3, 10, '#5a3a1c')


def bed(d):
    orect(d, 0, 8, 48, 14, '#e7a7bf', '#5e3d24')
    orect(d, 0, 0, 6, 26, '#8d6140', '#5e3d24')
    orect(d, 42, 6, 6, 20, '#8d6140', '#5e3d24')
    orect(d, 6, 6, 12, 6, '#f6f1ea', '#c9b8c4')
    rect(d, 18, 10, 24, 2, '#c97b98')
    rect(d, 2, 26, 4, 2, '#5e3d24')
    rect(d, 42, 26, 4, 2, '#5e3d24')


def drawer(d):
    orect(d, 0, 0, 22, 18, '#8d6140', '#5e3d24')
    for y in (4, 10):
        rect(d, 2, y, 18, 1, '#5e3d24')
        rect(d, 10, y + 2, 2, 1, '#e8b83c')
    rect(d, 2, 18, 3, 2, '#5e3d24')
    rect(d, 17, 18, 3, 2, '#5e3d24')


def trash_can(d):
    orect(d, 0, 4, 10, 10, '#b4b4c0', '#5a5f66')
    for x, y in ((1, 1), (4, 0), (6, 2), (2, 3)):
        rect(d, x, y, 3, 3, '#f2f0ea')


def undying_flower(d):
    """The Undying Flower - the cure: the red flower CubeBot holds in his
    portrait, in pixels. A rounded tulip bud of two petals (the deep red one
    in front on the left, the bright red one behind on the right), a green
    stem, and two bright oval leaves (one high on the right, one low on the
    left). The same picture on the summit, in his hands in the storyboard,
    and under the glass dome."""
    dark, bright = (222, 7, 43), (253, 7, 48)
    stem, leaf = (36, 168, 15), (46, 206, 21)
    rect(d, 7, 9, 2, 13, OUT)
    rect(d, 7, 9, 1, 13, stem)
    rect(d, 8, 9, 1, 13, (30, 140, 12))
    d.ellipse([9, 10, 15, 14], fill=OUT)
    d.ellipse([10, 11, 14, 13], fill=leaf)
    d.ellipse([1, 15, 7, 19], fill=OUT)
    d.ellipse([2, 16, 6, 18], fill=leaf)
    # the bud: two rounded petals, the bright one behind on the right and
    # the deep red one in front on the left, as in his portrait
    d.rounded_rectangle([3, 0, 13, 11], radius=4, fill=OUT)
    d.rounded_rectangle([8, 1, 12, 10], radius=3, fill=bright)
    d.rounded_rectangle([4, 1, 9, 10], radius=3, fill=dark)
    rect(d, 11, 3, 1, 3, (255, 110, 130))


def rubble(d):
    for (x, y, w, h, c) in [(0, 6, 8, 6, '#8a8a96'), (6, 3, 9, 9, '#7a7a86'), (13, 7, 7, 5, '#9a9aa6'), (4, 9, 5, 3, '#6b6b77')]:
        orect(d, x, y, w, h, c)


if __name__ == '__main__':
    castle_walls()
    castle_hall(night=True)
    castle_hall(night=False)
    princess_room(night=True)
    princess_room(night=False)
    library()
    town()
    mountains()
    deep_forest()
    enchanted_forest()
    water_forest()
    city_night()
    seer_house()
    castle_courtyard()
    castle_outskirts()
    hillside_bg()
    mountain_high()
    world_tree()
    tile('roof', roof_tile)
    tile('house-wall', house_wall_tile)
    tile('castle-block', castle_block_tile)
    tile('carpet', carpet_tile)
    tile('bookshelf', bookshelf_tile)
    tile('barrel', barrel_tile)
    tile('snow-rock', snow_rock_tile)
    tile('log', log_tile)
    tile('wood-floor', wood_floor_tile)
    prop('flower-stem', 6, 14, flower_stem)
    prop('flower-head-red', 7, 6, flower_head('#e0453c', '#ffd36b'))
    prop('flower-head-yellow', 7, 6, flower_head('#f2c94c', '#b5653a'))
    prop('flower-head-pink', 7, 6, flower_head('#f08fc0', '#ffffff'))
    prop('flower-head-blue', 7, 6, flower_head('#7fb8f0', '#ffffff'))
    prop('torch', 8, 15, torch)
    prop('flame', 6, 6, flame)
    prop('lamp-post', 10, 50, lamp_post)
    prop('banner', 12, 27, banner)
    prop('vine', 11, 24, vine)
    prop('gate', 56, 60, gate)
    prop('market-stall', 44, 36, market_stall)
    prop('training-dummy', 20, 40, training_dummy)
    prop('big-tree', 56, 80, big_tree)
    prop('white-tree', 32, 80, white_tree)
    prop('bush', 40, 22, bush)
    prop('glow-root', 41, 9, glow_root)
    prop('glow-mushroom', 10, 12, glow_mushroom)
    prop('firefly', 4, 4, firefly)
    prop('pollen', 4, 4, pollen)
    prop('mist', 120, 10, mist)
    prop('moon', 16, 16, moon)
    prop('candle', 6, 13, candle)
    prop('table', 30, 14, table)
    prop('bed', 48, 28, bed)
    prop('drawer', 22, 20, drawer)
    prop('trash-can', 10, 14, trash_can)
    prop('undying-flower', 16, 22, undying_flower)
    prop('rubble', 20, 12, rubble)
    house_gable(6)
    house_gable(7)
    prop('house-door', 14, 22, house_door)
    prop('castle-tower', 44, 240, castle_tower)
    prop('castle-doorway', 56, 240, castle_doorway)
    prop('room-doorway', 40, 240, room_doorway)
    prop('city-gate', 90, 120, city_gate)
    prop('stone-pillar', 18, 80, stone_pillar)
    prop('twig', 26, 8, twig)
    prop('music-note', 9, 11, music_note)
    prop('thorn-vine', 120, 18, thorn_vine)
    prop('canopy-bed', 64, 56, canopy_bed)
    rich_prop('glass-dome', 22, 30, glass_dome)
    rich_prop('seer-bed', 60, 34, seer_bed)
    prop('cauldron', 24, 24, cauldron)
    prop('crystal-ball', 14, 15, crystal_ball)
    prop('herbs', 12, 18, herbs)
    prop('potion-shelf', 30, 40, potion_shelf)
    prop('potted-plant', 14, 20, potted_plant)
    prop('library-facade', 100, 230, library_facade)
    prop('tall-grass', 40, 26, tall_grass)
    prop('dust-cloud', 40, 22, dust_cloud)
    prop('cloud-sea', 160, 26, cloud_sea)
