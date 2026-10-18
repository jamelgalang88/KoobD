# Colour storyboard frame for The False Knight, following the layout of the
# storyboard in "The False Knight Script.pdf" (page 24): Frame 01, Shot 01 -
# "Cubebot Wakes up from a Nap", seen from above as he lies in the grass.
#
#   python _make_storyboard.py frame01  ->  the game's frame-01.jpg
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
S = 2                       # supersampling: drawn at twice the size, then reduced
PW, PH = 1600, 900          # the panel (16:9)

# CubeBot's colours, from his provided portrait.
YELLOW = (251, 187, 59)
YELLOW_SIDE = (220, 157, 30)
YELLOW_MARK = (239, 168, 24)
GREY = (171, 169, 165)
GREY_DARK = (122, 120, 116)
EYE = (62, 61, 61)
LINE = (58, 44, 30)


def font(size, bold=False, italic=False):
    names = (['georgiab.ttf'] if bold else ['georgiai.ttf'] if italic else ['georgia.ttf']) + ['arial.ttf', 'DejaVuSans.ttf']
    for name in names:
        for folder in ('', 'C:/Windows/Fonts/'):
            try:
                return ImageFont.truetype(folder + name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def wobble(points, rnd, amount):
    """Hand-drawn feel: nudge every point a little."""
    return [(x + rnd.uniform(-amount, amount), y + rnd.uniform(-amount, amount)) for x, y in points]


def rounded_box(x0, y0, x1, y1, r, steps=6):
    """Points around a rounded rectangle."""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def solid(d, pts, fill, outline=LINE, width=5):
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=outline, width=width, joint='curve')


def block(d, x0, y0, x1, y1, r, rnd, depth=(26, 30), top=YELLOW, side=YELLOW_SIDE):
    """A chunky box seen from above: its top face, and its thickness showing
    on the side away from the light."""
    face = wobble(rounded_box(x0, y0, x1, y1, r), rnd, 3)
    under = [(x + depth[0], y + depth[1]) for x, y in face]
    solid(d, under, side)
    # fill the gap between face and underside so the box reads as solid
    for (ax, ay), (bx, by) in zip(face, under):
        d.line([(ax, ay), (bx, by)], fill=side, width=10)
    solid(d, face, top)
    return face


def marks(d, rnd, x0, y0, x1, y1, n):
    """The little worn dashes on CubeBot's panels."""
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        w = rnd.uniform(14, 30)
        d.rounded_rectangle([x, y, x + w, y + 9], radius=4, fill=YELLOW_MARK)


def draw_cubebot():
    """CubeBot lying on his back, drawn upright in his own canvas (the camera
    looks straight down on him) - rotated into place afterwards."""
    w, h = 1300, 1500
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rnd = random.Random(4)
    # legs and feet (furthest from the camera's centre, drawn first)
    for lx, tilt in ((470, -8), (790, 10)):
        d.rounded_rectangle([lx - 26, 1040, lx + 26, 1150], radius=10, fill=GREY, outline=LINE, width=5)
        foot = wobble([(lx - 70 + tilt, 1290), (lx - 52, 1140), (lx + 52, 1140), (lx + 74 + tilt, 1290)], rnd, 4)
        under = [(x + 18, y + 22) for x, y in foot]
        solid(d, under, YELLOW_SIDE)
        solid(d, foot, YELLOW)
    # arms: the left flung out on the grass, the right resting at his side
    d.line([(330, 760), (210, 690)], fill=LINE, width=56)
    d.line([(330, 760), (210, 690)], fill=GREY, width=44)
    block(d, 70, 600, 230, 760, 34, rnd, depth=(18, 22))
    marks(d, rnd, 100, 640, 190, 720, 2)
    d.line([(930, 830), (1010, 930)], fill=LINE, width=56)
    d.line([(930, 830), (1010, 930)], fill=GREY, width=44)
    block(d, 960, 900, 1110, 1050, 32, rnd, depth=(18, 22))
    marks(d, rnd, 990, 940, 1080, 1010, 2)
    # body
    block(d, 300, 640, 960, 1060, 44, rnd)
    marks(d, rnd, 360, 680, 900, 1000, 7)
    # neck
    d.rounded_rectangle([570, 560, 690, 660], radius=12, fill=GREY_DARK, outline=LINE, width=5)
    # head, turned a little on the grass
    head = Image.new('RGBA', (w, 760), (0, 0, 0, 0))
    hd = ImageDraw.Draw(head)
    block(hd, 300, 110, 980, 590, 46, rnd)
    marks(hd, rnd, 360, 150, 920, 250, 4)
    marks(hd, rnd, 360, 470, 920, 540, 3)
    # eyes, just opening after the nap: heavy lids over the dark ovals
    for ex in (500, 790):
        hd.ellipse([ex - 44, 290, ex + 44, 430], fill=EYE)
        hd.rectangle([ex - 60, 270, ex + 60, 330], fill=YELLOW)
        hd.arc([ex - 50, 300, ex + 50, 360], 200, 340, fill=LINE, width=6)
        hd.ellipse([ex - 14, 350, ex + 4, 372], fill=(235, 235, 230))   # a glint of morning light
    head = head.rotate(-7, resample=Image.BICUBIC, center=(640, 590))
    img.alpha_composite(head, (0, 0))
    return img


def grass_field(rnd):
    """The meadow from above: soft patches of green, morning light falling
    from the top left, and thousands of blades."""
    W, H = PW * S, PH * S
    base = Image.new('RGB', (W, H), (96, 156, 70))
    d = ImageDraw.Draw(base)
    for _ in range(260):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(60, 260)
        c = rnd.choice([(84, 142, 60), (110, 170, 78), (128, 182, 86), (72, 128, 54), (140, 190, 92)])
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=c)
    base = base.filter(ImageFilter.GaussianBlur(40))
    # warm morning light from the top left
    light = Image.new('L', (W, H), 0)
    ld = ImageDraw.Draw(light)
    ld.ellipse([-W * 0.55, -H * 0.9, W * 0.7, H * 0.85], fill=150)
    light = light.filter(ImageFilter.GaussianBlur(220))
    base = Image.composite(Image.new('RGB', (W, H), (238, 226, 150)), base, light.point(lambda v: v * 0.45))
    return base.convert('RGBA')


def blade(d, x, y, length, angle, width, colour):
    """One grass blade: a thin curved stroke tapering to a point."""
    bend = random.uniform(-0.5, 0.5)
    pts = []
    for i in range(7):
        t = i / 6
        a = angle + bend * t
        pts.append((x + math.cos(a) * length * t, y + math.sin(a) * length * t))
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=colour, width=max(1, int(width * (1 - i / 7))))


def blades(img, rnd, count, region=None, mask=None, tall=False):
    d = ImageDraw.Draw(img)
    W, H = img.size
    greens = [(52, 104, 40), (70, 128, 50), (118, 176, 76), (150, 200, 96), (92, 150, 62), (176, 214, 120)]
    placed = 0
    while placed < count:
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        if region and not (region[0] <= x <= region[2] and region[1] <= y <= region[3]):
            continue
        if mask is not None and mask.getpixel((int(min(W - 1, x)), int(min(H - 1, y)))) == 0:
            continue
        # seen from above, blades fan out every way, leaning with the breeze
        angle = rnd.uniform(-math.pi, math.pi) * 0.55 - math.pi / 2 + rnd.uniform(-1.2, 1.2)
        length = rnd.uniform(40, 110) * (1.7 if tall else 1)
        blade(d, x, y, length, angle, rnd.uniform(3, 6) * (1.3 if tall else 1), rnd.choice(greens))
        placed += 1


def flowers(img, rnd, count, avoid=None):
    d = ImageDraw.Draw(img)
    W, H = img.size
    colours = [((224, 69, 60), (255, 211, 107)), ((240, 143, 192), (255, 255, 255)), ((242, 201, 76), (181, 101, 58)),
               ((255, 255, 255), (242, 201, 76)), ((170, 130, 220), (255, 230, 150))]
    for _ in range(count):
        cx, cy = rnd.uniform(0, W), rnd.uniform(0, H)
        if avoid is not None and avoid.getpixel((int(cx), int(cy))) > 0:
            continue
        petal, centre = rnd.choice(colours)
        # a small cluster, as in the sketch's dotted wildflowers
        for _ in range(rnd.randint(1, 4)):
            x, y = cx + rnd.uniform(-40, 40), cy + rnd.uniform(-40, 40)
            r = rnd.uniform(9, 15)
            for k in range(5):
                a = k * 2 * math.pi / 5
                px, py = x + math.cos(a) * r * 0.8, y + math.sin(a) * r * 0.8
                d.ellipse([px - r * 0.6, py - r * 0.6, px + r * 0.6, py + r * 0.6], fill=petal, outline=LINE, width=2)
            d.ellipse([x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4], fill=centre)


def panel():
    rnd = random.Random(12)
    random.seed(12)
    W, H = PW * S, PH * S
    img = grass_field(rnd)
    blades(img, rnd, 5200)

    bot = draw_cubebot()
    scale = 0.92
    bot = bot.resize((int(bot.width * scale), int(bot.height * scale)), Image.LANCZOS)
    bot = bot.rotate(52, resample=Image.BICUBIC, expand=True)    # lying diagonally, head to the upper left
    bx, by = int(W * 0.5 - bot.width / 2), int(H * 0.5 - bot.height / 2 + 30)

    # where he lies: a soft shadow pressed into the grass
    alpha = bot.getchannel('A')
    shadow = Image.new('RGBA', bot.size, (20, 40, 16, 0))
    shadow.putalpha(alpha.point(lambda v: 150 if v > 40 else 0).filter(ImageFilter.GaussianBlur(26)))
    img.alpha_composite(shadow, (bx + 40, by + 46))
    # flattened grass right around him
    flat = Image.new('L', (W, H), 0)
    flat.paste(alpha.filter(ImageFilter.MaxFilter(61)), (bx, by))
    img.alpha_composite(bot, (bx, by))

    # tall blades and flowers growing up around and over his edges, so he is
    # lying *in* the grass rather than on top of it
    ring = Image.new('L', (W, H), 0)
    ring.paste(alpha.filter(ImageFilter.MaxFilter(41)), (bx, by))
    inner = Image.new('L', (W, H), 0)
    inner.paste(alpha.filter(ImageFilter.MinFilter(41)), (bx, by))
    edge = Image.composite(Image.new('L', (W, H), 0), ring, inner)
    blades(img, rnd, 420, mask=edge, tall=True)
    flowers(img, rnd, 70, avoid=flat)
    blades(img, rnd, 600)

    # gentle vignette, like the sketch's soft edges
    vignette = Image.new('L', (W, H), 0)
    ImageDraw.Draw(vignette).ellipse([-W * 0.15, -H * 0.2, W * 1.15, H * 1.2], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(200))
    dark = Image.new('RGBA', (W, H), (34, 52, 30, 255))
    img = Image.composite(img, dark, vignette.point(lambda v: 90 + v * 165 // 255))
    return img.resize((PW, PH), Image.LANCZOS)


# Frames the game no longer shows (the climb and the summit are played now);
# they are kept for the storyboard book only.
BOOK_ONLY = {67, 68, 70}
BOOK_DIR = os.path.join(HERE, 'book-frames')


def render_frames(numbers=None):
    """Draw the other frames (02-90) from _storyboard_frames.py into the game."""
    import sys
    sys.path.insert(0, HERE)
    from _storyboard_frames import FRAMES
    from _storyboard_kit import Frame
    out_dir = os.path.join(HERE, '..', 'src', 'The False Knight', 'storyboard')
    os.makedirs(out_dir, exist_ok=True)
    for spec in FRAMES:
        if numbers and spec['number'] not in numbers:
            continue
        f = Frame(seed=spec['number'])
        spec['draw'](f)
        art = f.result()
        target = BOOK_DIR if spec['number'] in BOOK_ONLY else out_dir
        os.makedirs(target, exist_ok=True)
        art.save(os.path.join(target, f"frame-{spec['number']:02d}.jpg"), quality=86, optimize=True)
        print('drew frame', spec['number'])


def wrap_text(d, text, fnt, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if d.textlength(trial, font=fnt) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def book():
    """The colour storyboard as a PDF, laid out like the storyboard pages in
    the script: three frames a page, each with its Frame and Shot numbers,
    ACTION and VOICEOVER."""
    import sys
    sys.path.insert(0, HERE)
    from _storyboard_frames import FRAMES
    frames_dir = os.path.join(HERE, '..', 'src', 'The False Knight', 'storyboard')
    # In story order: by scene, then frame number (frames added later, such as
    # 91-92 for scene 6, are filed under their own scene).
    specs = [dict(number=1, scene=1, shot=1, action='Cubebot wakes up from a nap.', voice='')] + sorted(FRAMES, key=lambda s: (s['scene'], s['number']))
    PW_, PH_ = 1700, 2200
    M = 90
    ink, soft = (34, 30, 28), (120, 112, 104)
    pages = []
    for i in range(0, len(specs), 3):
        page = Image.new('RGB', (PW_, PH_), (250, 248, 242))
        d = ImageDraw.Draw(page)
        d.text((M, M - 20), 'STORYBOARDING', font=font(46, bold=True), fill=ink)
        d.text((M, M + 44), 'Title:  The False Knight', font=font(26), fill=ink)
        d.text((M + 560, M + 44), 'Production:  Gotyme w/minion', font=font(26), fill=ink)
        d.text((PW_ - M - 290, M + 44), 'Version:  02 (colour)', font=font(26), fill=ink)
        d.line([(M, M + 94), (PW_ - M, M + 94)], fill=ink, width=3)
        y = M + 130
        for spec in specs[i:i + 3]:
            name = f"frame-{spec['number']:02d}.jpg"
            art = Image.open(os.path.join(BOOK_DIR if spec['number'] in BOOK_ONLY else frames_dir, name)).convert('RGB')
            aw = 1000
            ah = aw * 9 // 16
            art = art.resize((aw, ah), Image.LANCZOS)
            d.rectangle([M, y, M + 140, y + ah], outline=ink, width=3)
            d.line([(M, y + ah // 2), (M + 140, y + ah // 2)], fill=ink, width=3)
            d.text((M + 14, y + 12), 'Frame', font=font(22), fill=soft)
            d.text((M + 14, y + 44), f"{spec['scene']:02d}", font=font(64, bold=True), fill=ink)
            d.text((M + 14, y + ah // 2 + 12), 'Shot', font=font(22), fill=soft)
            d.text((M + 14, y + ah // 2 + 44), f"{spec['shot']:02d}", font=font(64, bold=True), fill=ink)
            ax = M + 160
            page.paste(art, (ax, y))
            d.rectangle([ax - 2, y - 2, ax + aw + 1, y + ah + 1], outline=ink, width=3)
            rx = ax + aw + 20
            rw = PW_ - M - rx
            d.rectangle([rx, y, rx + rw, y + ah], outline=ink, width=3)
            d.text((rx + 14, y + 10), 'ACTION', font=font(22, bold=True), fill=ink)
            yy = y + 44
            for ln in wrap_text(d, spec['action'], font(21), rw - 28)[:9]:
                d.text((rx + 14, yy), ln, font=font(21), fill=ink)
                yy += 28
            vy = y + ah * 2 // 3 - 30
            d.line([(rx, vy), (rx + rw, vy)], fill=ink, width=3)
            d.text((rx + 14, vy + 10), 'VOICEOVER', font=font(22, bold=True), fill=ink)
            yy = vy + 44
            for ln in wrap_text(d, spec['voice'] or '-', font(20, italic=True), rw - 28)[:4]:
                d.text((rx + 14, yy), ln, font=font(20, italic=True), fill=soft)
                yy += 26
            y += ah + 60
        d.text((PW_ - M - 40, PH_ - M), str(len(pages) + 1), font=font(26), fill=soft)
        pages.append(page)
    out = os.path.join(HERE, 'The False Knight Storyboard (Colour).pdf')
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=200, quality=85)
    print('wrote', out, len(pages), 'pages')


if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    if args and args[0] == 'frame01':
        art = panel()
        # The picture, shown in the game after the opening narration (its
        # storyboard page is in the book).
        game = os.path.join(HERE, '..', 'src', 'The False Knight', 'storyboard', 'frame-01.jpg')
        os.makedirs(os.path.dirname(game), exist_ok=True)
        art.convert('RGB').save(game, quality=88, optimize=True)
        print('wrote', os.path.normpath(game))
    elif args and args[0] == 'book':
        book()
    else:
        # frames 02-90 (or just the numbers given), then the book
        render_frames({int(a) for a in args} or None)
        if not args:
            book()
