import { Container, Graphics, Sprite, Text, type Texture, type Ticker } from 'pixi.js';
import { PT, STAGE_W, type PushConfig } from '../../config';
import { easeOutBack, tween } from '../tween';
import { IOS_FONT } from './StatusBar';

const MARGIN = 8 * PT;
const TOP = 52 * PT; // just under the Dynamic Island
const RADIUS = 24 * PT;
const PAD = 14 * PT;
const ICON = 38 * PT;

/**
 * iOS-style notification banner drawn on the canvas (so it is recorded):
 * app icon, bold title, body (up to 4 lines), time label. Slides in from the top.
 */
export class NotificationBanner extends Container {
  private readonly targetY = TOP;

  constructor(cfg: PushConfig, icon: Texture | null) {
    super({ label: 'push-banner' });
    const dark = cfg.style === 'dark';
    const w = STAGE_W - MARGIN * 2;
    const textX = PAD + ICON + 12 * PT;
    const textW = w - textX - PAD;

    const titleStyle = { fontFamily: IOS_FONT, fontSize: 15.5 * PT, fontWeight: '600' as const, fill: dark ? 0xffffff : 0x000000 };
    const time = new Text({ text: cfg.timeLabel, style: { fontFamily: IOS_FONT, fontSize: 13 * PT, fill: dark ? 0xa8a8ad : 0x6e6e73 } });
    const title = new Text({
      text: cfg.title,
      style: { ...titleStyle, wordWrap: true, wordWrapWidth: textW - time.width - 8 * PT, breakWords: true },
    });
    const body = new Text({
      text: cfg.body,
      style: {
        fontFamily: IOS_FONT, fontSize: 15.5 * PT, fill: dark ? 0xffffff : 0x000000, lineHeight: 20 * PT,
        wordWrap: true, wordWrapWidth: textW, breakWords: true,
      },
    });
    // keep the body to 4 lines like iOS
    const maxBody = 4 * 20 * PT;
    if (body.height > maxBody) {
      let s = cfg.body;
      while (s.length > 1 && body.height > maxBody) {
        s = s.slice(0, -2);
        body.text = `${s.trimEnd()}…`;
      }
    }
    const h = Math.max(ICON + PAD * 2, PAD + title.height + 2 * PT + body.height + PAD);

    // material: frosted panel + soft shadow
    const shadow = new Graphics().roundRect(0, 6 * PT, w, h, RADIUS).fill({ color: 0x000000, alpha: 0.18 });
    shadow.filters = [];
    const panel = new Graphics()
      .roundRect(0, 0, w, h, RADIUS)
      .fill({ color: dark ? 0x1c1c1e : 0xf5f5f7, alpha: dark ? 0.9 : 0.93 })
      .roundRect(0.5 * PT, 0.5 * PT, w - PT, h - PT, RADIUS)
      .stroke({ color: 0xffffff, alpha: dark ? 0.12 : 0.6, width: 1 * PT });
    this.addChild(shadow, panel);

    if (icon) {
      const s = new Sprite(icon);
      s.width = s.height = ICON;
      s.position.set(PAD, (h - ICON) / 2);
      const mask = new Graphics().roundRect(PAD, (h - ICON) / 2, ICON, ICON, ICON * 0.225).fill(0xffffff);
      s.mask = mask;
      this.addChild(s, mask);
    } else {
      this.addChild(new Graphics().roundRect(PAD, (h - ICON) / 2, ICON, ICON, ICON * 0.225).fill(0xff8a00));
    }
    title.position.set(textX, PAD);
    time.anchor.set(1, 0);
    time.position.set(w - PAD, PAD + 1 * PT);
    body.position.set(textX, PAD + title.height + 2 * PT);
    this.addChild(title, time, body);

    this.position.set(MARGIN, -h - 20 * PT);
  }

  /** Slide in from above the screen with a little spring. */
  show(ticker: Ticker, ms = 550): Promise<void> {
    const from = this.y;
    return tween(ticker, ms, (k) => (this.y = from + (this.targetY - from) * k), easeOutBack);
  }
}
