"""Cut spin buttons, total bar, respin pips and write layout.json (run after build_bg.py)."""
import cv2, numpy as np, json, os
D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '../../..'))
OUT = os.path.join(ROOT, 'public/private/coin-volcano/code')
PL = os.path.join(ROOT, 'public/private/coin-volcano/plate')


def L(k): return cv2.imread(os.path.join(D, '_frames', f'f{k:04d}.png'))


def save_rgba(name, bgr, a):
    cv2.imwrite(os.path.join(OUT, name), np.dstack([bgr, a]))


def rr_alpha(h, w, rad, inset=0, ss=4):
    m = np.zeros((h * ss, w * ss), np.uint8)
    cv2.rectangle(m, (inset * ss + rad * ss, inset * ss), ((w - inset) * ss - rad * ss, (h - inset) * ss), 255, -1)
    cv2.rectangle(m, (inset * ss, inset * ss + rad * ss), ((w - inset) * ss, (h - inset) * ss - rad * ss), 255, -1)
    for cx, cy in [(inset + rad, inset + rad), (w - inset - rad, inset + rad), (inset + rad, h - inset - rad), (w - inset - rad, h - inset - rad)]:
        cv2.circle(m, (cx * ss, cy * ss), rad * ss, 255, -1)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA)


# ---- spin buttons
SPIN = {'base': (538.5, 1619.5, 114), 'bonus': (540.5, 1695.5, 115)}
bgb = cv2.imread(os.path.join(OUT, 'bg-base.png'))
bgn = cv2.imread(os.path.join(OUT, 'bg-bonus.png'))
# remove the respin digit from the bonus background (and so from the cut)
cx, cy, r = SPIN['bonus']
cx, cy = int(round(cx)), int(round(cy))
g = cv2.cvtColor(bgn, cv2.COLOR_BGR2GRAY)
yy, xx = np.mgrid[0:2340, 0:1080]
msk = ((g > 90) & ((xx - cx) ** 2 + (yy - cy) ** 2 < 42 ** 2)).astype(np.uint8) * 255
msk = cv2.dilate(msk, np.ones((7, 7), np.uint8))
bgn = cv2.inpaint(bgn, msk, 5, cv2.INPAINT_TELEA)
cv2.imwrite(os.path.join(OUT, 'bg-bonus.png'), bgn)
for name, src, key in (('spin-button.png', bgb, 'base'), ('spin-button-bonus.png', bgn, 'bonus')):
    cx, cy, r = SPIN[key]
    R = r + 4
    x0, y0 = int(round(cx)) - R, int(round(cy)) - R
    S = 2 * R + 1
    crop = src[y0:y0 + S, x0:x0 + S]
    m = np.zeros((S * 4, S * 4), np.uint8)
    cv2.circle(m, (int((cx - x0 + .5) * 4), int((cy - y0 + .5) * 4)), int((r + 1.5) * 4), 255, -1)
    save_rgba(name, crop, cv2.resize(m, (S, S), interpolation=cv2.INTER_AREA))
    SPIN[key] = (cx, cy, r, x0, y0, S)

# ---- total bar (empty, median of t=25.4..25.8)
bar = np.median(np.stack([L(k) for k in (127, 128, 129)]), 0).astype(np.uint8)
BX0, BY0, BX1, BY1 = 252, 1397, 828, 1507
crop = bar[BY0:BY1, BX0:BX1]
h, w = crop.shape[:2]
save_rgba('total-bar.png', crop, rr_alpha(h, w, h // 2 - 1, 1))

# ---- respin pips (all three orange; median of t=12.0 and 22.8) and single pips
p = np.median(np.stack([L(60), L(114)]), 0).astype(np.uint8)
PX0, PY0, PX1, PY1 = 347, 1442, 730, 1509
reg = p[PY0 - 6:PY1 + 6, PX0 - 10:PX1 + 10].astype(int)
orange = (reg[..., 2] > 200) & (reg[..., 0] < 90)
ys, xs = np.where(orange)
print('pips orange bbox', xs.min() + PX0 - 10, xs.max() + PX0 - 10, ys.min() + PY0 - 6, ys.max() + PY0 - 6)
crop = p[PY0:PY1, PX0:PX1]
h, w = crop.shape[:2]
save_rgba('respin-pips.png', crop, rr_alpha(h, w, 11, 1))
pw = w // 3
save_rgba('respin-pip-on.png', crop[:, :pw + 2], rr_alpha(h, pw + 2, 11, 1))
dp = L(84)[PY0:PY1, PX0:PX1]  # t=16.8: third pip dark
save_rgba('respin-pip-off.png', dp[:, w - pw - 2:], rr_alpha(h, pw + 2, 11, 1))

# ---- layout.json
pj = json.load(open(os.path.join(PL, 'patches.json')))
it = {i['id']: i['text'] for i in pj['items']}


def t(id_):
    x = it[id_]
    return {'cx': x['cx'], 'cy': x['cy'], 'height': x['height']}


def side(mode):
    s = {'plates': {k: t(f'jp-{k}-{mode}') for k in ('grand', 'major', 'minor', 'mini')}}
    s['bet'] = t(f'bet-{mode}')
    s['balance'] = t(f'bal-{mode}-0')
    win = dict(s['bet'])
    win.update({'cx': 55.5, 'align': 'left', 'left': 8,
                'note': 'estimated: mirror of the Bet slot; the reference never shows a win value'})
    s['win'] = win
    sp = SPIN[mode]
    s['spin'] = {'cx': sp[0], 'cy': sp[1], 'r': sp[2]}
    return s


base = {'cells': {'x': [217, 539, 862], 'y': [679, 929, 1174]}, 'coinR': 140}
base.update(side('base'))
bon = {'cells': {'x': [208, 541, 873], 'y': [855, 1112, 1369]}, 'coinR': 140}
bon.update(side('bonus'))
tb = it['total-bar']
bon['totalBar'] = {'x': BX0, 'y': BY0, 'w': BX1 - BX0, 'h': BY1 - BY0,
                   'textCx': tb['cx'], 'textCy': tb['cy'], 'textHeight': tb['height']}
bon['pips'] = {'x': PX0, 'y': PY0, 'w': PX1 - PX0, 'h': PY1 - PY0}
spin = {k: {'file': n, 'x': SPIN[k][3], 'y': SPIN[k][4], 'size': SPIN[k][5], 'cx': SPIN[k][0], 'cy': SPIN[k][1], 'r': SPIN[k][2]}
        for k, n in (('base', 'spin-button.png'), ('bonus', 'spin-button-bonus.png'))}
json.dump({'stage': {'w': 1080, 'h': 2340}, 'base': base, 'bonus': bon, 'spinFiles': spin,
           'pipFiles': {'strip': 'respin-pips.png', 'on': 'respin-pip-on.png', 'off': 'respin-pip-off.png',
                        'pipW': pw + 2, 'note': 'strip = all three pips orange (full); off = dark pip (used)'}},
          open(os.path.join(OUT, 'layout.json'), 'w'), indent=1)
