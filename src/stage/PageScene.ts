import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { PT, STAGE_H, STAGE_W, type ImageFit, type PageBlock, type PageConfig } from '../config';
import { ensureFont, type CustomFont } from '../fonts';
import { fillTemplate, formatCurrency, type Region } from '../money';
import type { TakeValues } from '../games/createGame';
import { IOS_FONT } from './ios/StatusBar';
import { loadTexture } from './textures';

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const PULL = 56 * PT; // pull-to-refresh distance

/** Place a sprite on the whole screen per the fit mode; returns false for 'free'. */
function fitToScreen(s: Sprite, tex: Texture, fit: ImageFit | undefined): boolean {
  const kx = STAGE_W / tex.width, ky = STAGE_H / tex.height;
  s.anchor.set(0.5);
  s.position.set(STAGE_W / 2, STAGE_H / 2);
  switch (fit) {
    case 'cover': s.scale.set(Math.max(kx, ky)); return true;
    case 'width': s.scale.set(kx); return true;
    case 'height': s.scale.set(ky); return true;
    case 'stretch': s.scale.set(kx, ky); return true;
    default: return false;
  }
}

/**
 * The page opened by tapping the notification (the game's wallet screen), built by
 * the user in Studio: background, image blocks (always under the texts), text and
 * amount blocks. Everything is a function of the time since the page opened.
 */
export class PageScene extends Container {
  /** Stage-px rectangles of each block (for Studio tap-to-edit), by block index. */
  readonly blockRects: { index: number; x: number; y: number; w: number; h: number }[] = [];
  private readonly images = new Container();
  private readonly content = new Container();
  private readonly spinner = new Graphics();
  private amounts: { node: Text; block: PageBlock }[] = [];

  private constructor(
    private readonly cfg: PageConfig,
    private readonly v: TakeValues,
    private readonly region: Region,
    private readonly fonts: CustomFont[],
  ) {
    super({ label: 'page' });
  }

  static async create(cfg: PageConfig, v: TakeValues, region: Region, fonts: CustomFont[] = []): Promise<PageScene> {
    const p = new PageScene(cfg, v, region, fonts);
    await p.build();
    return p;
  }

  private async build(): Promise<void> {
    this.addChild(new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(this.cfg.background));
    if (this.cfg.backgroundImage) {
      const tex = await loadTexture(this.cfg.backgroundImage);
      if (tex) {
        const s = new Sprite(tex);
        fitToScreen(s, tex, this.cfg.backgroundFit === 'free' ? 'cover' : (this.cfg.backgroundFit ?? 'cover'));
        this.addChild(s);
      }
    }
    // images below, texts and amounts above, whatever the block order
    this.addChild(this.images, this.spinner, this.content);
    for (const [i, b] of this.cfg.blocks.entries()) {
      const node = await this.block(b);
      if (!node) continue;
      (b.kind === 'image' ? this.images : this.content).addChild(node);
      const r = node.getBounds();
      this.blockRects.push({ index: i, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    // texts were added after images, so their rects must win the tap: images first
    this.blockRects.sort((a, b) => Number(this.cfg.blocks[b.index].kind === 'image') - Number(this.cfg.blocks[a.index].kind === 'image'));
    this.setTime(1e6);
  }

  private async block(b: PageBlock): Promise<Container | null> {
    const x = (b.x / 100) * STAGE_W;
    const y = (b.y / 100) * STAGE_H;
    if (b.kind === 'image') {
      if (!b.imageSrc) {
        const ph = new Container();
        const w = (b.size / 100) * STAGE_W, h = w * 0.6;
        ph.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, 24).stroke({ color: 0xffffff, alpha: 0.35, width: 4 }));
        const t = new Text({ text: 'image', style: { fontFamily: IOS_FONT, fontSize: 14 * PT, fill: 0xffffff } });
        t.anchor.set(0.5);
        t.alpha = 0.5;
        ph.addChild(t);
        ph.position.set(x, y);
        return ph;
      }
      const tex = await loadTexture(b.imageSrc);
      if (!tex) return null;
      const s = new Sprite(tex);
      if (!fitToScreen(s, tex, b.fit)) {
        s.anchor.set(0.5);
        s.scale.set(((b.size / 100) * STAGE_W) / tex.width);
        s.position.set(x, y);
      }
      return s;
    }
    const family = await ensureFont(b.font, this.fonts);
    const text = b.kind === 'amount' ? formatCurrency(this.v.start, this.region) : fillTemplate(b.text, this.v, this.region);
    const t = new Text({
      text,
      style: {
        fontFamily: family, fontSize: b.size * PT, fontWeight: b.weight, fill: b.color, align: b.align,
        wordWrap: true, wordWrapWidth: STAGE_W * 0.86,
      },
    });
    t.anchor.set(b.align === 'left' ? 0 : b.align === 'right' ? 1 : 0.5, 0.5);
    t.position.set(x, y);
    if (b.kind === 'amount') this.amounts.push({ node: t, block: b });
    return t;
  }

  /** Show the page `ms` after it opened (amount animation per the chosen mode). */
  setTime(ms: number): void {
    const c = this.cfg;
    const t = ms - c.amountDelayMs;
    const dur = Math.max(1, c.amountDurationMs);
    let value = this.v.start;
    let pull = 0;
    let spin = 0;
    if (c.amountAnim === 'counter') {
      const k = Math.max(0, Math.min(1, t / dur));
      value = this.v.start + (this.v.balance - this.v.start) * easeInOut(k);
    } else if (c.amountAnim === 'spinner') {
      if (t >= dur) value = this.v.balance;
      else if (t >= 0) spin = 1;
    } else {
      const down = 0.3 * dur, hold = 0.5 * dur;
      if (t >= 0 && t < down) pull = easeInOut(t / down);
      else if (t >= down && t < down + hold) {
        pull = 1;
        spin = 1;
      } else if (t >= down + hold) {
        pull = Math.max(0, 1 - (t - down - hold) / (0.2 * dur));
        value = this.v.balance;
      }
    }
    for (const a of this.amounts) a.node.text = formatCurrency(Math.round(value * 100) / 100, this.region);
    this.content.y = pull * PULL;
    this.images.y = pull * PULL;
    this.spinner.clear();
    if (spin || pull > 0) {
      const cx = STAGE_W / 2, cy = 70 * PT + pull * PULL * 0.4;
      const a0 = (ms / 1000) * Math.PI * 2;
      this.spinner.arc(cx, cy, 14 * PT, a0, a0 + Math.PI * 1.5).stroke({ color: 0xffffff, alpha: spin ? 0.9 : 0.5 * pull, width: 3 * PT, cap: 'round' });
    }
  }
}
