"""Build empty-board backgrounds (bg-base.png, bg-bonus.png) from the reference-take frame dumps.
Run dump_frames.py first. Output goes to public/private/coin-volcano/code/."""
import cv2, numpy as np, json, os
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '../../..'))
OUT = os.path.join(ROOT, 'public/private/coin-volcano/code')
PL = os.path.join(ROOT, 'public/private/coin-volcano/plate')
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 2340

def load(k): return cv2.imread(os.path.join(D, '_frames', f'f{k:04d}.png'))
def med(ks): return np.median(np.stack([load(k) for k in ks]), 0).astype(np.uint8)
def disc(m, cx, cy, r): cv2.circle(m, (int(cx), int(cy)), int(r), 255, -1)

def paint_v(cv, dm, ml, x0, hw, y0, y1, cross=(), srcy=None, srcx=None, sm=None):
    """repaint dirty rows of a vertical line from the median cross-section of clean rows
    (rows srcy at column srcx; default: its own rows). Rows inside `cross` windows (a horizontal
    line crosses there) are lighten-blended."""
    ys = np.arange(y0, y1); sl = slice(x0 - hw, x0 + hw + 1)
    sy = np.concatenate([np.arange(a, b) for a, b in srcy]) if srcy else ys
    sxc = srcx or x0; ssl = slice(sxc - hw, sxc + hw + 1)
    def inwin(arr):
        r = np.zeros(len(arr), bool)
        for (a, b) in cross: r |= (arr >= a) & (arr <= b)
        return r
    inx = inwin(ys)
    sdirty = (sm if sm is not None else dm)[sy, ssl].any(1)
    clean = (~sdirty) & (~inwin(sy))
    if clean.sum() < 3: print('paint_v: no clean rows', x0, y0, y1); return
    prof = np.median(cv[sy[clean], ssl].astype(np.float32), 0)
    dirty = dm[ys, sl].any(1)
    for y in ys[dirty]:
        if inx[y - y0]: cv[y, sl] = np.maximum(cv[y, sl], prof.astype(np.uint8))
        else: cv[y, sl] = prof
        ml[y, sl] = 0

def paint_h(cv, dm, ml, y0, hw, xa, xb, src=None, cross=(), sm=None):
    xs = np.arange(xa, xb); sl = slice(y0 - hw, y0 + hw + 1)
    sa, sb = src if src else (xa, xb)
    sx = np.arange(sa, sb)
    oks = np.ones(len(sx), bool)
    for (a, b) in cross: oks &= ~((sx >= a) & (sx <= b))
    cl = (~(sm if sm is not None else dm)[sl, sa:sb].any(0)) & oks
    if cl.sum() < 3: return
    prof = np.median(cv[sl][:, sx[cl]].astype(np.float32), 1)
    dirty = dm[sl, xa:xb].any(0)
    for x in xs[dirty]: cv[sl, x] = prof; ml[sl, x] = 0

def rowfill(cv, ml, y0, y1, x0, x1):
    """fill dirty runs row-wise by linear interpolation between clean neighbours"""
    for y in range(y0, y1):
        d = ml[y, x0:x1] > 0
        x = 0
        while x < len(d):
            if not d[x]: x += 1; continue
            e = x
            while e < len(d) and d[e]: e += 1
            l = cv[y, max(x0 + x - 4, 0):x0 + x].mean(0) if x > 0 else None
            r = cv[y, x0 + e:x0 + e + 4].mean(0) if e < len(d) else None
            for i in range(x, e):
                if l is not None and r is not None: t = (i - x + 1) / (e - x + 1); v = l * (1 - t) + r * t
                else: v = l if l is not None else r
                cv[y, x0 + i] = v
            x = e
        ml[y, x0:x1] = 0

def colfill(cv, ml0, x0, x1, y0, y1, pad=28):
    """column-wise linear interpolation over the dirty extent (+pad) of ml0, for gradient areas outside the grid"""
    for x in range(x0, x1):
        ys = np.where(ml0[y0:y1, x] > 0)[0]
        if len(ys) == 0: continue
        a = max(y0 + ys.min() - pad, y0 + 1); b = min(y0 + ys.max() + pad, y1 - 2)
        top = cv[a - 3:a, x].mean(0); bot = cv[b + 1:b + 4, x].mean(0)
        t = (np.arange(a, b + 1) - a) / max(b - a, 1)
        cv[a:b + 1, x] = (top[None] * (1 - t[:, None]) + bot[None] * t[:, None])

def reflect(sx, lo, hi):
    sx = np.where(sx < lo, 2 * lo - sx, sx); sx = np.where(sx > hi, 2 * hi - sx, sx)
    return np.clip(sx, lo, hi)

def paste_patch(cv, name, x, y):
    p = np.array(Image.open(os.path.join(PL, 'patches', name)).convert('RGBA')).astype(np.float32)
    a = p[..., 3:4] / 255
    reg = cv[y:y + p.shape[0], x:x + p.shape[1]].astype(np.float32)
    cv[y:y + p.shape[0], x:x + p.shape[1]] = (reg * (1 - a) + p[..., [2, 1, 0]] * a).astype(np.uint8)

pj = json.load(open(os.path.join(PL, 'patches.json')))
items = {i['id']: i for i in pj['items']}
def patches(cv, ids):
    for i in ids:
        it = items[i]; paste_patch(cv, os.path.basename(it['patch']), it['x'], it['y'])

def fill_cells(cv, mask, cells, srcfn):
    """cells: list of (x0,x1,y0,y1,r,c). srcfn(x,y,r,c)->(sx,sy) index arrays"""
    for (x0, x1, y0, y1, r, c) in cells:
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        m = mask[y0:y1 + 1, x0:x1 + 1] > 0
        sx, sy = srcfn(xx, yy, r, c)
        src = cv[sy, sx]
        a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 5)[..., None]
        a = np.where(m[..., None], 1.0, a)
        reg = cv[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
        cv[y0:y1 + 1, x0:x1 + 1] = (reg * (1 - a) + src * a).astype(np.uint8)
        mask[y0:y1 + 1, x0:x1 + 1] = 0

def finish(cv, mask, rows):
    res = mask.copy(); res[:rows[0]] = 0; res[rows[1]:] = 0
    res = cv2.dilate(res, np.ones((3, 3), np.uint8))
    return cv2.inpaint(cv, res, 6, cv2.INPAINT_TELEA)

# ---------------- BASE ----------------
def base():
    cv = med(range(1, 7))
    BX = [217, 539, 862]; BY = [679, 929, 1174]
    m = np.zeros((H, W), np.uint8)
    for (c, r) in [(0, 0), (2, 0), (2, 1)]: disc(m, BX[c], BY[r], 200)
    ml = cv2.dilate(m, np.ones((15, 15), np.uint8)); ml0 = ml.copy()
    cx = [217.5, 540.5, 864.5]
    cols = [(60, 368), (390, 690), (712, 1017)]; rows = [(567, 800), (816, 1049), (1064, 1294)]
    cells = [(cols[c][0], cols[c][1], rows[r][0], rows[r][1], r, c) for r in range(3) for c in range(3)]
    def src(xx, yy, r, c):
        return reflect(np.rint(xx - (cx[c] - 539.5)).astype(int), 428, 652), yy
    fill_cells(cv, ml, cells, src)
    dm = ml.copy()
    hys = [(808 - 8, 808 + 8), (1056 - 8, 1056 + 8), (559 - 8, 559 + 8)]
    vxs = [(370, 388), (692, 710)]
    for hy in (808, 1056): paint_h(cv, dm, ml, hy, 7, 60, 1017, (412, 667), cross=vxs)
    paint_h(cv, dm, ml, 559, 7, 60, 1017, (60, 100), cross=vxs)
    for ri, (a, b) in enumerate(rows):
        for vx in (379, 701):
            if ri == 1: paint_v(cv, dm, ml, vx, 11, a - 8, b + 9, cross=hys, srcy=[(816, 1049)], srcx=379)
            else: paint_v(cv, dm, ml, vx, 11, a - 8, b + 9, cross=hys, srcy=[(567, 800), (1064, 1294)], srcx=379)
    for (a, b) in [(563, 806), (1060, 1296)]:
        paint_v(cv, dm, ml, 50, 9, a, b, srcy=[(1060, 1296)]); paint_v(cv, dm, ml, 1027, 9, a, b, srcy=[(1060, 1296)])
    # right frame of row 1: mirror of the left (x' = 1077 - x)
    for y in range(812, 1053):
        if dm[y, 1018:1037].any():
            cv[y, 1018:1037] = cv[y, 41:60][::-1]; ml[y, 1018:1037] = 0
    rowfill(cv, ml, 515, 559, 62, 1020)
    colfill(cv, ml0, 0, 44, 480, 1330); colfill(cv, ml0, 1038, 1080, 480, 1330)
    cv = finish(cv, ml, (480, 1330))
    patches(cv, ['jp-grand-base', 'jp-major-base', 'jp-minor-base', 'jp-mini-base', 'bet-base', 'bal-base-0'])
    cv2.imwrite(os.path.join(OUT, 'bg-base.png'), cv)
    return cv

# ---------------- BONUS ----------------
def bonus():
    cv = med(range(62, 99, 3))
    OX = [208, 541, 873]; OY = [855, 1112, 1369]
    m = np.zeros((H, W), np.uint8)
    for (r, c) in [(0, 1), (1, 0), (1, 1), (1, 2), (2, 1)]: disc(m, OX[c], OY[r], 204)
    disc(m, 873, 1369, 222)
    cv2.rectangle(m, (338, 1436), (748, 1512), 255, -1)
    ml = cv2.dilate(m, np.ones((15, 15), np.uint8)); ml[:706] = 0; ml0 = ml.copy()
    cols = [(48, 363), (387, 696), (720, 1034)]; rows = [(741, 981), (999, 1235), (1253, 1491)]
    ccx = [207.5, 541, 876.5]; ccy = [861, 1117, 1372]
    cells = [(cols[c][0], cols[c][1], rows[r][0], rows[r][1], r, c) for r in range(3) for c in range(3)]
    def src(xx, yy, r, c):
        sx = reflect(np.rint(207.5 + xx - ccx[c]).astype(int), 48, 322)
        v = yy - ccy[r]
        sy = np.where(v < 0, 861 + v, 1372 + v)
        return sx, np.clip(sy, 741, 1491)
    fill_cells(cv, ml, cells, src)
    dm = ml.copy()
    sm = np.zeros((H, W), np.uint8)
    for (r, c) in [(0, 1), (1, 0), (1, 1), (1, 2), (2, 1)]: disc(sm, OX[c], OY[r], 180)
    disc(sm, 873, 1369, 195)
    vxs = [(364, 386), (697, 719)]; hys = [(983, 997), (1237, 1251), (725, 739)]
    for hy in (990, 1244): paint_h(cv, dm, ml, hy, 7, 48, 1034, (48, 1034), cross=vxs, sm=sm)
    paint_h(cv, dm, ml, 732, 7, 48, 1034, (48, 1034), cross=vxs, sm=sm)
    for (a, b) in rows:
        for vx in (375, 708): paint_v(cv, dm, ml, vx, 11, a - 8, b + 9, cross=hys, srcy=rows, srcx=375, sm=sm)
    paint_v(cv, dm, ml, 38, 9, 741, 1492, srcy=rows, sm=sm); paint_v(cv, dm, ml, 1045, 9, 741, 1492, srcy=rows, sm=sm)
    ml[1508:1566, 338:1080] = 255
    rowfill(cv, ml, 1508, 1566, 300, 1080)
    paint_h(cv, dm, ml, 1500, 7, 340, 1030, (60, 330))
    rowfill(cv, ml, 706, 731, 48, 1034)
    colfill(cv, ml0, 0, 34, 700, 1560); colfill(cv, ml0, 1054, 1080, 700, 1560)
    cv = finish(cv, ml, (600, 1580))
    patches(cv, ['jp-grand-bonus', 'jp-major-bonus', 'jp-minor-bonus', 'jp-mini-bonus', 'bet-bonus', 'bal-bonus-0'])
    cv2.imwrite(os.path.join(OUT, 'bg-bonus.png'), cv)
    return cv

if __name__ == '__main__':
    base(); bonus()
