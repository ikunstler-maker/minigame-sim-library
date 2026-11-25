import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { PT, type WeatherConfig } from '../../config';
import { IOS_FONT } from './StatusBar';
import { weatherIcon } from './weatherIcons';

/** Medium (4x2) widget size in stage pixels. */
export const WIDGET_W = 345 * PT;
export const WIDGET_H = 162 * PT;

/** Next six hour labels after the status-bar time, e.g. '11AM' or '11'. */
export function hourLabels(time: string, format: '12h' | '24h'): string[] {
  const h0 = Number.parseInt(time.split(':')[0] ?? '0', 10) || 0;
  return Array.from({ length: 6 }, (_, i) => {
    const h = (h0 + 1 + i) % 24;
    if (format === '24h') return String(h);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${h < 12 ? 'AM' : 'PM'}`;
  });
}

/**
 * iOS medium Weather widget: city, big temperature, condition, H/L and six hourly columns.
 * Layout follows the user's reference screenshot.
 */
export class WeatherWidget extends Container {
  constructor(cfg: WeatherConfig, clock: string) {
    super();
    const w = WIDGET_W, h = WIDGET_H, pad = 17 * PT;
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: cfg.gradient[0] },
        { offset: 1, color: cfg.gradient[1] },
      ],
      textureSpace: 'local',
    });
    const r = 24 * PT;
    this.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(grad));
    // soft glass rim
    this.addChild(new Graphics().roundRect(0.75 * PT, 0.75 * PT, w - 1.5 * PT, h - 1.5 * PT, r).stroke({ color: 0xffffff, alpha: 0.28, width: 1.2 * PT }));

    const txt = (text: string, size: number, weight: string, alpha = 1) =>
      new Text({ text, style: { fontFamily: IOS_FONT, fontSize: size * PT, fontWeight: weight as '400', fill: 0xffffff } , alpha });

    const city = txt(cfg.city, 17, '600');
    city.position.set(pad, pad - 2 * PT);
    this.addChild(city);
    if (cfg.showLocationArrow) {
      const ax = pad + city.width + 6 * PT, ay = pad + 3 * PT, s = 11 * PT;
      // location arrow (paper plane pointing up-right)
      this.addChild(new Graphics().poly([ax + s, ay, ax, ay + s * 0.45, ax + s * 0.48, ay + s * 0.52, ax + s * 0.55, ay + s]).fill(0xffffff));
    }

    const temp = txt(`${cfg.temp}°`, 48, '300');
    temp.position.set(pad - 2 * PT, pad + 16 * PT);
    this.addChild(temp);

    const icon = weatherIcon(cfg.condition, 22 * PT);
    icon.position.set(w - pad - 11 * PT, pad + 9 * PT);
    this.addChild(icon);

    const cond = txt(cfg.conditionLabel, 15, '500');
    cond.anchor.set(1, 0);
    cond.position.set(w - pad, pad + 32 * PT);
    this.addChild(cond);
    const hl = txt(`${cfg.highLabel}:${cfg.high}° ${cfg.lowLabel}:${cfg.low}°`, 15, '500');
    hl.anchor.set(1, 0);
    hl.position.set(w - pad, pad + 51 * PT);
    this.addChild(hl);

    const labels = hourLabels(clock, cfg.hourFormat);
    const colW = (w - pad * 2) / 6;
    cfg.hourly.slice(0, 6).forEach((f, i) => {
      const cx = pad + colW * (i + 0.5);
      const hl2 = txt(labels[i], 12.5, '500', 0.72);
      hl2.anchor.set(0.5, 0);
      hl2.position.set(cx, h - 70 * PT);
      const ic = weatherIcon(f.condition, 21 * PT);
      ic.position.set(cx, h - 40 * PT);
      const t = txt(`${f.temp}°`, 15, '600');
      t.anchor.set(0.5, 0);
      t.position.set(cx, h - 26 * PT);
      this.addChild(hl2, ic, t);
    });
  }
}
