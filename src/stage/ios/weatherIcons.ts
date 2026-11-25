import { Container, Graphics } from 'pixi.js';
import type { WeatherCondition } from '../../config';

const WHITE = 0xffffff;
const SUN = 0xffcc00;
const RAIN = 0x5ac8fa;

/** Cloud silhouette in a 1x1 box scaled by `s` (width), origin top-left. */
function cloud(g: Graphics, s: number, ox = 0, oy = 0, color = WHITE, alpha = 1): void {
  const h = s * 0.62;
  g.circle(ox + s * 0.33, oy + h * 0.6, s * 0.2)
    .circle(ox + s * 0.56, oy + h * 0.44, s * 0.27)
    .circle(ox + s * 0.78, oy + h * 0.66, s * 0.17)
    .roundRect(ox + s * 0.1, oy + h * 0.58, s * 0.83, h * 0.42, h * 0.21)
    .fill({ color, alpha });
}

function sun(g: Graphics, cx: number, cy: number, r: number, rays: boolean): void {
  g.circle(cx, cy, r).fill(SUN);
  if (!rays) return;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45)
      .lineTo(cx + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 1.9)
      .stroke({ color: SUN, width: r * 0.28, cap: 'round' });
  }
}

/**
 * Weather glyph drawn with vectors, sized to `size` px, centred on (0,0).
 * Covers the conditions the Studio offers.
 */
export function weatherIcon(cond: WeatherCondition, size: number): Container {
  const c = new Container();
  const g = new Graphics();
  const s = size;
  const o = -s / 2;
  switch (cond) {
    case 'sunny':
      sun(g, 0, 0, s * 0.24, true);
      break;
    case 'night-clear':
      g.circle(0, 0, s * 0.36).fill(WHITE).circle(s * 0.18, -s * 0.12, s * 0.3).cut();
      break;
    case 'partly-cloudy':
      sun(g, s * 0.16, -s * 0.12, s * 0.22, false);
      cloud(g, s * 0.9, o, o + s * 0.2);
      break;
    case 'cloudy':
      cloud(g, s, o, o + s * 0.18);
      break;
    case 'fog':
      cloud(g, s * 0.9, o + s * 0.05, o + s * 0.05, WHITE, 0.9);
      for (let i = 0; i < 2; i++) g.roundRect(o + s * 0.1, s * (0.2 + i * 0.16), s * 0.8, s * 0.07, s * 0.035).fill(WHITE);
      break;
    case 'rain':
    case 'storm':
      cloud(g, s, o, o + s * 0.02);
      if (cond === 'rain') {
        for (let i = 0; i < 3; i++) {
          const x = o + s * (0.3 + i * 0.2);
          g.moveTo(x, s * 0.22).lineTo(x - s * 0.06, s * 0.4).stroke({ color: RAIN, width: s * 0.07, cap: 'round' });
        }
      } else {
        g.poly([0, s * 0.12, -s * 0.12, s * 0.32, 0, s * 0.32, -s * 0.06, s * 0.5, s * 0.14, s * 0.24, 0, s * 0.24]).fill(SUN);
      }
      break;
    case 'snow':
      cloud(g, s, o, o + s * 0.02);
      for (let i = 0; i < 3; i++) g.circle(o + s * (0.3 + i * 0.2), s * 0.32, s * 0.05).fill(WHITE);
      break;
  }
  c.addChild(g);
  return c;
}
