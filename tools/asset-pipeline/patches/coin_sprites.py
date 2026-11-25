"""Replace the flat coin "band" patches with clean coin sprites from the press kit.

The press kit has blank coins (Assets/Symbols/sym1.png gold, sym5.png red). Each coin
item in patches.json loses its band patch; instead `text.coin` names the sprite and
`text.coinCx/coinCy/coinR` place it over the video coin. The app draws the sprite
under the number (src/games/coin-volcano-plate/numbersLayer.ts) and dims it at
`text.dimAt`, when the coin is collected in the reference take.

Usage: python tools/asset-pipeline/patches/coin_sprites.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLATE = ROOT / 'public/private/coin-volcano/plate'
SRC = ROOT / 'Assets/Symbols'

# Coin centres measured with HoughCircles on frames 6.8 s (base) and 22.0 s (bonus).
GRID = {
    'base': {'x': [217, 539, 862], 'y': [679, 929, 1174]},
    'bonus': {'x': [208, 541, 873], 'y': [855, 1112, 1369]},
}
COIN_R = 140  # coin radius in the video (outer rim), px
HOUGH_R = 150.5
FLARE, FLARE_SCALE = (4.9, 7.4), 1.12  # HoughCircles radius of a coin at rest (it also catches the glow)
WHIRL_R = 150
# Moment each coin is collected into the total bar (reference steps 25.9 … 29.5 s).
DIM_AT = {'r0c0': 25.9, 'r0c1': 26.5, 'r0c2': 27.1, 'r1c0': 27.4, 'r1c1': 28.0, 'r1c2': 28.6, 'r2c1': 28.9, 'r2c2': 29.5}


VIDEO = ROOT / 'Assets/ref CV 1125.mp4'
FPS = 30
CROP_TOP = 3


def track_radii(items: list) -> dict:
    """Per item: {frame: (cx, cy, r)} from HoughCircles near the item's coin centre.

    Coins pop and pulse (landing, bonus trigger); following the real radius keeps the
    sprite exactly over the video coin.
    """
    import cv2
    import numpy as np

    want = {}
    for it in items:
        t = it['text']
        f0, f1 = int(it['t0'] * FPS), int(it['t1'] * FPS) + 1
        want[it['id']] = (f0, f1, t['coinCx'], t['coinCy'])
    last = max(v[1] for v in want.values())
    cap = cv2.VideoCapture(str(VIDEO))
    out = {k: {} for k in want}
    f = 0
    while f <= last:
        ok, frame = cap.read()
        if not ok:
            break
        active = [(k, v) for k, v in want.items() if v[0] <= f <= v[1]]
        if active:
            g = cv2.medianBlur(cv2.cvtColor(frame[CROP_TOP:CROP_TOP + 2340], cv2.COLOR_BGR2GRAY), 5)
            for k, (_, _, cx, cy) in active:
                x0, y0 = int(cx - 230), int(cy - 230)
                roi = g[max(0, y0):y0 + 460, max(0, x0):x0 + 460]
                c = cv2.HoughCircles(roi, cv2.HOUGH_GRADIENT, dp=1.2, minDist=400, param1=80, param2=35, minRadius=110, maxRadius=200)
                if c is None:
                    continue
                bx, by, br = c[0][0]
                ax, ay = bx + max(0, x0), by + max(0, y0)
                if abs(ax - cx) < 45 and abs(ay - cy) < 45:
                    out[k][f] = (float(ax), float(ay), float(br))
        f += 1
    cap.release()
    return out


def smooth_track(samples: dict, it: dict, base_r: float, size: float) -> list:
    """Median-filtered radius per frame → track keys (top-left of the scaled box)."""
    import numpy as np

    if len(samples) < 3:
        return []
    frames = sorted(samples)
    rs = np.array([samples[f][2] for f in frames])
    k = 5
    med = np.array([np.median(rs[max(0, i - k):i + k + 1]) for i in range(len(rs))])
    keys = []
    prev = None
    t = it['text']
    for f, r in zip(frames, med):
        s = round(min(1.2, max(0.85, float(r) / base_r)), 3)
        if prev is not None and abs(s - prev) < 0.01 and f != frames[-1]:
            continue
        prev = s
        d = size * s
        keys.append({'t': round(f / FPS, 3), 'x': round(t['coinCx'] - d / 2, 1), 'y': round(t['coinCy'] - d / 2, 1), 'scale': s, 'alpha': 1})
    return keys


def main() -> None:
    (PLATE / 'coins').mkdir(exist_ok=True)
    shutil.copy(SRC / 'sym1.png', PLATE / 'coins/coin-gold.png')
    shutil.copy(SRC / 'sym5.png', PLATE / 'coins/coin-red.png')
    shutil.copy(SRC / 'sym8.png', PLATE / 'coins/whirl.png')
    src = PLATE / 'patches.json'
    backup = PLATE / 'patches.bands.json'
    if not backup.exists():
        shutil.copy(src, backup)
    data = json.loads(backup.read_text(encoding='utf-8'))
    changed = 0
    # red coins: any cell whose band patch was the red one
    red_keys = {it['text']['key'] for it in data['items'] if 'red' in (it.get('patch') or '') and it.get('text')}
    for it in data['items']:
        t = it.get('text') or {}
        is_whirl_cell = t.get('key') == 'r2c2' and t.get('kind') in ('counter', 'coin') and not it['id'].startswith('coin-base')
        if is_whirl_cell:
            # Coin Collect whirl value: spinning whirl sprite instead of the blurred label
            cx, cy = GRID['bonus']['x'][2], GRID['bonus']['y'][2]
            size = WHIRL_R * 2 + 8
            it['x'], it['y'], it['w'], it['h'] = cx - size / 2, cy - size / 2, size, size
            it.pop('patch', None)
            t['coin'], t['coinCx'], t['coinCy'], t['coinR'] = 'whirl', cx, cy, WHIRL_R
            if t.pop('dim', False):
                t['dimAt'] = DIM_AT['r2c2']
            it.pop('track', None)
            changed += 1
            continue
        if t.get('kind') != 'coin':
            continue
        key = t['key']  # r<row>c<col>
        row, col = int(key[1]), int(key[3])
        grid = GRID['base' if it['id'].startswith('coin-base') else 'bonus']
        cx, cy = grid['x'][col], grid['y'][row]
        red = key in red_keys
        size = COIN_R * 2 + 8
        it['x'], it['y'], it['w'], it['h'] = cx - size / 2, cy - size / 2, size, size
        it.pop('patch', None)
        # keep alpha keys (flash), re-anchor positions to the new box
        if it.get('track'):
            it['track'] = [{'t': k['t'], 'x': it['x'], 'y': it['y'], 'scale': 1, 'alpha': k.get('alpha', 1)} for k in it['track']]
        t['coin'] = 'red' if red else 'gold'
        t['coinCx'], t['coinCy'], t['coinR'] = cx, cy, COIN_R
        if t.pop('dim', False):
            t['dimAt'] = DIM_AT.get(key)
        changed += 1
    # follow the real coin size frame by frame (pops, pulses)
    coins = [it for it in data['items'] if (it.get('text') or {}).get('coin') in ('gold', 'red')]
    radii = track_radii(coins)
    for it in coins:
        keys = smooth_track(radii[it['id']], it, HOUGH_R, it['w'])
        alpha = {round(k['t'], 2): k.get('alpha', 1) for k in it.get('track') or []}
        if keys:
            if alpha:  # keep the flash fade-outs of dimmed coins
                for k in keys:
                    near = min(alpha, key=lambda a: abs(a - k['t']))
                    k['alpha'] = alpha[near] if abs(near - k['t']) < 0.2 else 1
            if it['id'].startswith('coin-base'):
                # bonus-trigger flare (≈4.9–7.4 s): coins are ~12 % bigger; Hough loses them in the fire
                for k in keys:
                    if FLARE[0] <= k['t'] <= FLARE[1] and k['scale'] < FLARE_SCALE:
                        d = it['w'] * FLARE_SCALE
                        k['scale'], k['x'], k['y'] = FLARE_SCALE, round(it['text']['coinCx'] - d / 2, 1), round(it['text']['coinCy'] - d / 2, 1)
            it['track'] = keys
    # numbers on the total bar must stay above the coins
    data['items'].sort(key=lambda i: 1 if (i.get('text') or {}).get('key') == 'total' else 0)
    src.write_text(json.dumps(data, indent=1), encoding='utf-8')
    print('tracked:', sum(1 for it in coins if it.get('track')), 'of', len(coins))
    print(f'coin items updated: {changed}')


if __name__ == '__main__':
    main()
