import { Container, Graphics, Text } from 'pixi.js';
import { PT, STAGE_W, type StatusBarConfig } from '../../config';

/** iOS system font stack (SF Pro on Apple devices). */
export const IOS_FONT = ['-apple-system', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Arial', 'sans-serif'];

const CENTER_Y = 29 * PT; // vertical centre of status items, aligned with the island

/**
 * iOS 27 status bar: time (left ear), Dynamic Island, signal / Wi-Fi / battery (right ear).
 * Drawn on the canvas so it is part of the recording.
 */
export class StatusBar extends Container {
  constructor(private readonly cfg: StatusBarConfig) {
    super();
    this.draw();
  }

  /** Rebuild after config changes. */
  draw(): void {
    this.removeChildren().forEach((c) => c.destroy());
    const cfg = this.cfg;
    const fg = cfg.style === 'dark' ? 0x000000 : 0xffffff;

    if (cfg.showDynamicIsland) {
      const w = 126 * PT, h = 37 * PT;
      this.addChild(new Graphics().roundRect((STAGE_W - w) / 2, 11 * PT, w, h, h / 2).fill(0x000000));
    }

    const time = new Text({
      text: cfg.time,
      style: { fontFamily: IOS_FONT, fontSize: 17 * PT, fontWeight: '600', fill: fg, letterSpacing: -0.2 * PT },
    });
    time.anchor.set(0.5);
    time.position.set(66 * PT, CENTER_Y);
    this.addChild(time);

    // Right cluster, laid out right-to-left from the battery.
    const right = 372 * PT;
    const battery = this.battery(fg);
    battery.position.set(right - 27 * PT, CENTER_Y - 6 * PT);
    this.addChild(battery);
    let x = right - 27 * PT - 6 * PT;
    if (cfg.wifi) {
      const wifi = this.wifi(fg);
      wifi.position.set(x - 15.5 * PT, CENTER_Y - 5.5 * PT);
      this.addChild(wifi);
      x -= 15.5 * PT + 6 * PT;
    }
    const sig = this.signal(fg);
    sig.position.set(x - 17 * PT, CENTER_Y - 5.5 * PT);
    this.addChild(sig);
  }

  private signal(fg: number): Graphics {
    const g = new Graphics();
    const heights = [4.5, 6.5, 8.5, 11];
    heights.forEach((h, i) => {
      g.roundRect(i * 4.6 * PT, (11 - h) * PT, 3.2 * PT, h * PT, 0.9 * PT)
        .fill({ color: fg, alpha: i < this.cfg.signal ? 1 : 0.3 });
    });
    return g;
  }

  private wifi(fg: number): Graphics {
    const g = new Graphics();
    const cx = 7.75 * PT, cy = 11 * PT;
    const a0 = -Math.PI * 0.75, a1 = -Math.PI * 0.25;
    // inner wedge
    g.moveTo(cx, cy).arc(cx, cy, 3.6 * PT, a0, a1).closePath().fill(fg);
    // outer arcs
    for (const r of [6.9, 10.4]) {
      g.arc(cx, cy, r * PT, a0 + 0.06, a1 - 0.06).stroke({ color: fg, width: 2.1 * PT, cap: 'round' });
    }
    return g;
  }

  private battery(fg: number): Container {
    const c = new Container();
    const w = 25 * PT, h = 12 * PT, r = 4 * PT;
    const level = Math.max(0, Math.min(100, this.cfg.battery)) / 100;
    const levelColor = this.cfg.charging
      ? 0x34c759
      : this.cfg.lowPowerMode
        ? 0xffcc00
        : this.cfg.battery <= 20
          ? 0xff3b30
          : fg;
    c.addChild(new Graphics().roundRect(0, 0, w, h, r).fill({ color: fg, alpha: 0.35 }));
    const fill = new Graphics().rect(0, 0, w * level, h).fill(levelColor);
    const mask = new Graphics().roundRect(0, 0, w, h, r).fill(0xffffff);
    fill.mask = mask;
    c.addChild(fill, mask);
    c.addChild(new Graphics().roundRect(w + 1 * PT, h / 2 - 2 * PT, 1.6 * PT, 4 * PT, 0.8 * PT).fill({ color: fg, alpha: 0.4 }));
    if (this.cfg.batteryShowPercent) {
      const t = new Text({
        text: String(Math.round(this.cfg.battery)),
        style: { fontFamily: IOS_FONT, fontSize: 9.5 * PT, fontWeight: '700', fill: fg === 0 ? 0xffffff : 0x000000 },
      });
      t.anchor.set(0.5);
      t.position.set(w / 2, h / 2 + 0.3 * PT);
      c.addChild(t);
    }
    return c;
  }
}
