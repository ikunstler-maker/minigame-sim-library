import { Container, Sprite, type Texture } from 'pixi.js';
import type { OverlayItem } from './timeline';
import { formatMoney, makeNumber, setNumberText, type NumberKind } from './numbers/numberStyles';

/** Text block attached to a patch item in patches.json. */
export interface PatchText {
  kind: 'jackpot' | 'coin' | 'counter' | 'balance' | 'bet' | 'win' | 'bigwin' | string;
  key: string;
  ref: string;
  cx: number;
  cy: number;
  height: number;
  countUp?: { from: string; to: string; t0: number; t1: number };
  /** Clean coin sprite drawn under the number ('gold' | 'red'), centred on coinCx/coinCy. */
  coin?: 'gold' | 'red' | 'whirl';
  coinCx?: number;
  coinCy?: number;
  /** Coin radius in the video, px. */
  coinR?: number;
  /** Video time when the coin is collected and turns dark. */
  dimAt?: number;
  /** Step counter as in the video: value jumps at each t. */
  steps?: { t: number; v: string }[];
}

export interface MoneyFormat {
  thousands: string;
  decimal: string;
  decimals: number;
  prefix: string;
  suffix: string;
}

/** Studio key for one editable number: "<kind>:<key>" (plus ":from"/":to" for count-ups). */
export const valueKey = (t: PatchText, part?: 'from' | 'to') => `${t.kind}:${t.key}${part ? `:${part}` : ''}`;

/**
 * The text block of a patch item, with a unique Studio key: balances share the key
 * "balance" in patches.json but show different moments, so they use the item id.
 */
export function itemText(item: { id?: string; text?: PatchText }): PatchText | null {
  const t = item.text;
  if (!t) return null;
  return t.kind === 'balance' && item.id ? { ...t, key: item.id } : t;
}

/** "25,000.00" → 25000 */
export function parseRef(s: string): number {
  return Number(s.replace(/[^0-9.]/g, '')) || 0;
}

/** Which visual style a patch kind uses. */
function styleFor(kind: string, key: string): NumberKind {
  if (kind === 'jackpot') return key === 'grand' ? 'plate' : 'plateLight';
  if (kind === 'coin') return 'coin';
  if (kind === 'counter') return key === 'sizzling' ? 'bigwin' : /^r\dc\d$/.test(key) ? 'whirl' : 'counter';
  if (kind === 'bigwin') return 'bigwin';
  return 'ui';
}


/** The multiplier baked into the plate video (big "X4"). */
export const PLATE_MULTIPLIER = 4;

/**
 * Fill in the totals that depend on the coins, unless the user set them by hand:
 * total bar = sum of the final bonus coins (incl. the whirl), big win = total × X4,
 * final balance = big win. Keeps every number on screen consistent.
 */
export function deriveTotals(items: { id?: string; text?: PatchText }[], values: Record<string, number>): Record<string, number> {
  const out = { ...values };
  const texts = items.map(itemText).filter((t): t is PatchText => !!t);
  const final = new Map<string, number>();
  for (const t of texts) {
    const isBonusCoin = (t.kind === 'coin' || t.kind === 'counter') && /^r\dc\d$/.test(t.key);
    if (!isBonusCoin) continue;
    const v = out[valueKey(t)];
    final.set(t.key, typeof v === 'number' ? v : parseRef(t.ref));
  }
  const total = [...final.values()].reduce((a, b) => a + b, 0);
  const win = total * PLATE_MULTIPLIER;
  for (const t of texts) {
    if (t.kind === 'counter' && t.key === 'total') {
      out[valueKey(t, 'to')] ??= total;
      out[valueKey(t)] ??= total;
    }
    if (t.kind === 'counter' && t.key === 'sizzling') {
      out[valueKey(t, 'to')] ??= win;
      out[valueKey(t)] ??= win;
    }
    if (t.kind === 'balance' && t.key === 'bal-final') out[valueKey(t)] ??= win;
  }
  return out;
}

/**
 * Builds the configurable numbers drawn over the video patches.
 * Values come from `values` (Studio) and fall back to the number seen in the video.
 */
export class NumbersLayer {
  private counters: {
    node: Container;
    from: number;
    to: number;
    t0: number;
    t1: number;
    /** Step values scaled to the configured end value. */
    steps?: { t: number; v: number }[];
  }[] = [];

  private dimmers: { node: Container; at: number }[] = [];
  private spinners: Sprite[] = [];

  /**
   * @param coins clean coin textures (press-kit sym1 / sym5); coin radius in the art is 108 of 237 px
   */
  constructor(
    private readonly values: Record<string, number>,
    private readonly fmt: MoneyFormat,
    private readonly coins: { gold: Texture | null; red: Texture | null; whirl?: Texture | null } = { gold: null, red: null },
  ) {}

  private money(v: number): string {
    return this.fmt.prefix + formatMoney(v, this.fmt) + this.fmt.suffix;
  }

  private value(t: PatchText, part?: 'from' | 'to', fallback?: string): number {
    const v = this.values[valueKey(t, part)];
    return typeof v === 'number' && Number.isFinite(v) ? v : parseRef(fallback ?? t.ref);
  }

  /** `makeContent` hook for PlateGame: one number per patch item that has `text`. */
  readonly makeContent = (item: OverlayItem): Container | null => {
    const t = itemText(item as OverlayItem & { text?: PatchText });
    if (!t) return null;
    const style = styleFor(t.kind, t.key);
    let node: Container;
    if (t.countUp) {
      const from = this.value(t, 'from', t.countUp.from);
      const to = this.value(t, 'to', t.countUp.to);
      node = makeNumber(style, this.money(from), t.height);
      const refTo = parseRef(t.countUp.to) || 1;
      const steps = t.steps?.map((s) => ({ t: s.t, v: (parseRef(s.v) * to) / refTo }));
      this.counters.push({ node, from, to, t0: t.countUp.t0, t1: t.countUp.t1, steps });
    } else {
      node = makeNumber(style, this.money(this.value(t)), t.height * (style === 'coin' ? 1.14 : 1));
    }
    // The free font is wider than the game's: keep the number inside its patch.
    this.fit(node, item.w * (style === 'coin' || style === 'whirl' ? 1 : 0.92));
    node.position.set(t.cx - item.x, t.cy - item.y);
    const tex = t.coin ? this.coins[t.coin] : null;
    if (!tex || t.coinCx === undefined || t.coinCy === undefined) return node;
    // clean coin from the press kit under the number, replacing the video coin's digits
    const wrap = new Container();
    const coin = new Sprite(tex);
    coin.anchor.set(0.5);
    // coin art: radius 108 of 237 px; whirl art: radius 121 of 276 px
    const artR = t.coin === 'whirl' ? 121 * (tex.width / 276) : 108 * (tex.width / 237);
    coin.scale.set((t.coinR ?? 150) / artR);
    if (t.coin === 'whirl') this.spinners.push(coin);
    coin.position.set(t.coinCx - item.x, t.coinCy - item.y);
    wrap.addChild(coin, node);
    if (t.dimAt !== undefined) this.dimmers.push({ node: wrap, at: t.dimAt });
    return wrap;
  };

  private fit(node: Container, maxW: number): void {
    const s = node.width > maxW ? maxW / node.width : 1;
    node.scale.set(s);
    (node as Container & { _fitW?: number })._fitW = maxW;
  }

  /** Advance counters to the plate time (seconds): steps jump, count-ups run linearly. Call every frame. */
  update(time: number): void {
    // collected coins turn dark, as in the reference
    for (const d of this.dimmers) d.node.tint = time >= d.at ? 0x5e5040 : 0xffffff;
    // the Coin Collect whirl turns slowly, about one turn in 2.5 s
    for (const w of this.spinners) w.rotation = -time * ((Math.PI * 2) / 2.5);
    for (const c of this.counters) {
      let v: number;
      if (c.steps?.length) {
        v = c.steps[0].v;
        for (const s of c.steps) if (time >= s.t) v = s.v;
      } else {
        const k = Math.max(0, Math.min(1, (time - c.t0) / Math.max(0.001, c.t1 - c.t0)));
        v = c.from + (c.to - c.from) * k;
        // the game counts in whole units (…, 3,458.00, …)
        v = k < 1 ? Math.round(v) : v;
      }
      setNumberText(c.node, this.money(v));
      const n = c.node as Container & { _fitW?: number };
      if (n._fitW) {
        n.scale.set(1);
        if (n.width > n._fitW) n.scale.set(n._fitW / n.width);
      }
    }
  }
}
