# Draws the 2D dialogue portraits for the characters added to the game
# (Guard, Head Guard, Doctor), in the flat, soft-shaded cartoon
# style of the provided portraits (CUBEBOT.png, FLOWER.png, ...): 1000x1000,
# transparent background, character centred. Drawn at 2x and downsampled so
# every edge is smooth. (The Seer and the King have hand-drawn portraits,
# SEER/SEER.png and KING/KING.png, which this script leaves alone.)
#
#   python _make_portraits.py        (run from "The False Knight" folder)
import os
from PIL import Image, ImageDraw, ImageFilter

S = 2
SIZE = 1000 * S


def canvas():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def k(v):
    return [int(round(n * S)) for n in v]


def rr(d, box, r, fill):
    d.rounded_rectangle(k(box), radius=int(r * S), fill=fill)


def ell(d, box, fill):
    d.ellipse(k(box), fill=fill)


def poly(d, pts, fill):
    d.polygon([tuple(k(p)) for p in pts], fill=fill)


def line(d, pts, fill, w):
    d.line([tuple(k(p)) for p in pts], fill=fill, width=int(w * S), joint='curve')


def glow(img, box, color, radius):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(k(box), fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * S))
    img.alpha_composite(layer)


def save(img, path):
    img.resize((1000, 1000), Image.LANCZOS).save(path)
    print('wrote', path)


def knight(head):
    img, d = canvas()
    steel, steel_d, steel_l, dark = '#a9b3be', '#7d8794', '#dbe2e8', '#1b2027'
    tab, tab_d, gold = ('#c0392b', '#8f241c', '#e8b83c') if head else ('#3f63b3', '#2c4885', '#e2b440')
    if head:  # cape behind
        poly(d, [(330, 430), (670, 430), (700, 800), (300, 800)], '#8f241c')
    # spear
    rr(d, (690, 150, 712, 830), 10, '#7a5230')
    poly(d, [(701, 70), (735, 160), (701, 190), (667, 160)], steel_l)
    poly(d, [(701, 70), (701, 190), (667, 160)], '#c3ccd4')
    # legs + boots
    rr(d, (400, 640, 455, 760), 22, steel_d)
    rr(d, (545, 640, 600, 760), 22, steel_d)
    rr(d, (360, 730, 470, 800), 30, '#5d6670')
    rr(d, (530, 730, 640, 800), 30, '#5d6670')
    # body
    rr(d, (340, 430, 660, 680), 60, steel)
    rr(d, (340, 440, 380, 670), 20, steel_d)
    rr(d, (420, 430, 580, 690), 26, tab)
    rr(d, (420, 430, 440, 690), 10, tab_d)
    if head:
        rr(d, (420, 430, 580, 450), 8, gold)
        rr(d, (420, 670, 580, 690), 8, gold)
    rr(d, (465, 500, 535, 570), 14, gold)
    rr(d, (485, 520, 515, 550), 8, tab_d)
    rr(d, (340, 625, 660, 645), 8, '#5d6670')
    # arms
    ell(d, (275, 450, 365, 540), steel_d)
    rr(d, (270, 520, 350, 620), 36, steel)
    rr(d, (640, 470, 720, 560), 36, steel)
    ell(d, (655, 500, 745, 590), steel)
    # helmet
    if head:
        ell(d, (430, 90, 560, 230), '#d23b30')
        ell(d, (470, 70, 600, 200), '#e05248')
        ell(d, (520, 110, 610, 230), '#97241d')
    rr(d, (320, 170, 680, 440), 90, steel)
    rr(d, (330, 190, 380, 420), 25, steel_d)
    rr(d, (420, 180, 590, 205), 12, steel_l)
    rr(d, (370, 285, 640, 345), 26, dark)
    ell(d, (430, 300, 470, 330), '#7fe0ff')
    ell(d, (535, 300, 575, 330), '#7fe0ff')
    if head:
        rr(d, (320, 410, 680, 432), 10, gold)
    return img


def doctor():
    img, d = canvas()
    head, head_d, coat, coat_d = '#e4ecf0', '#c3cfd6', '#f9fbfc', '#d5dde3'
    rr(d, (400, 650, 455, 760), 22, '#8b949c')
    rr(d, (545, 650, 600, 760), 22, '#8b949c')
    rr(d, (360, 735, 470, 800), 30, '#3d434a')
    rr(d, (530, 735, 640, 800), 30, '#3d434a')
    # white coat
    rr(d, (330, 420, 670, 720), 60, coat)
    rr(d, (330, 440, 375, 700), 22, coat_d)
    poly(d, [(430, 420), (500, 520), (570, 420)], coat_d)
    rr(d, (493, 520, 507, 720), 6, coat_d)
    rr(d, (560, 520, 620, 540), 8, '#2fae5b')
    rr(d, (580, 500, 600, 560), 8, '#2fae5b')
    line(d, [(430, 430), (420, 540), (470, 600)], '#7f8a93', 10)
    ell(d, (455, 585, 495, 625), '#9aa5ad')
    # arms
    rr(d, (265, 450, 345, 610), 38, coat)
    rr(d, (655, 450, 735, 610), 38, coat)
    ell(d, (270, 590, 345, 665), head)
    ell(d, (655, 590, 730, 665), head)
    # head
    rr(d, (300, 160, 700, 430), 70, head)
    rr(d, (310, 180, 360, 410), 25, head_d)
    rr(d, (300, 215, 700, 240), 10, '#8b949c')
    ell(d, (450, 170, 550, 270), '#cfd8de')
    ell(d, (468, 188, 510, 230), '#ffffff')
    ell(d, (410, 290, 450, 360), '#1b1f24')
    ell(d, (550, 290, 590, 360), '#1b1f24')
    rr(d, (470, 385, 530, 395), 5, head_d)
    return img


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    for folder, name, draw in [
        ('GUARD', 'GUARD.png', lambda: knight(False)),
        ('HEAD GUARD', 'HEAD GUARD.png', lambda: knight(True)),
        ('DOCTOR', 'DOCTOR.png', doctor),
    ]:
        save(draw(), os.path.join(here, folder, name))
