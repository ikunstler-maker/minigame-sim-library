"""Side-by-side checks: reference | our bg, a layout overlay sheet, and a transparency sheet of the cut layers."""
import cv2, numpy as np, json, os
D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '../../..'))
OUT = os.path.join(ROOT, 'public/private/coin-volcano/code')
lay = json.load(open(os.path.join(OUT, 'layout.json')))


def L(k): return cv2.imread(os.path.join(D, '_frames', f'f{k:04d}.png'))


bb = cv2.imread(os.path.join(OUT, 'bg-base.png'))
bn = cv2.imread(os.path.join(OUT, 'bg-bonus.png'))


def half(im): return cv2.resize(im[100:2200], (540, 1050))


cv2.imwrite(os.path.join(D, '_frames', 'prev_t05.png'), np.hstack([half(L(2)), half(bb)]))
cv2.imwrite(os.path.join(D, '_frames', 'prev_t14.png'), np.hstack([half(L(70)), half(bn)]))


def overlay(bg, m):
    o = bg.copy()
    for x in m['cells']['x']:
        for y in m['cells']['y']:
            cv2.circle(o, (x, y), m['coinR'], (0, 255, 0), 3)
    for k, v in m['plates'].items():
        cv2.rectangle(o, (int(v['cx'] - 150), int(v['cy'] - v['height'] / 2)), (int(v['cx'] + 150), int(v['cy'] + v['height'] / 2)), (255, 255, 0), 2)
    for k in ('bet', 'win', 'balance'):
        v = m[k]
        w = 100 if k != 'balance' else 200
        cv2.rectangle(o, (int(v['cx'] - w / 2), int(v['cy'] - v['height'] / 2)), (int(v['cx'] + w / 2), int(v['cy'] + v['height'] / 2)), (255, 0, 255), 2)
    s = m['spin']
    cv2.circle(o, (int(s['cx']), int(s['cy'])), int(s['r']), (0, 255, 255), 3)
    if 'totalBar' in m:
        b = m['totalBar']
        cv2.rectangle(o, (b['x'], b['y']), (b['x'] + b['w'], b['y'] + b['h']), (255, 128, 0), 3)
        cv2.rectangle(o, (int(b['textCx'] - 100), int(b['textCy'] - b['textHeight'] / 2)), (int(b['textCx'] + 100), int(b['textCy'] + b['textHeight'] / 2)), (255, 255, 255), 2)
        p = m['pips']
        cv2.rectangle(o, (p['x'], p['y']), (p['x'] + p['w'], p['y'] + p['h']), (0, 0, 255), 3)
    return half(o)


cv2.imwrite(os.path.join(D, '_frames', 'check.png'), np.hstack([overlay(bb, lay['base']), overlay(bn, lay['bonus'])]))

ck = np.zeros((900, 1100, 3), np.uint8)
ck[:] = (90, 160, 90)
y = 10
for n in ('spin-button.png', 'spin-button-bonus.png', 'total-bar.png', 'respin-pips.png', 'respin-pip-on.png', 'respin-pip-off.png'):
    im = cv2.imread(os.path.join(OUT, n), cv2.IMREAD_UNCHANGED)
    print(n, im.shape)
    a = im[..., 3:4] / 255.
    if n.startswith('spin'):
        x, yy = (10 if n == 'spin-button.png' else 270), 10
    else:
        x, yy = 10, 270 + y
        y += im.shape[0] + 10
    h, w = im.shape[:2]
    ck[yy:yy + h, x:x + w] = (ck[yy:yy + h, x:x + w] * (1 - a) + im[..., :3] * a).astype(np.uint8)
cv2.imwrite(os.path.join(D, '_frames', 'layers.png'), ck)
