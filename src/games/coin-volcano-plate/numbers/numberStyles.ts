import { Container, FillGradient, Text, TextStyle } from 'pixi.js';

/** The kinds of numbers/text the Coin Volcano plate replica draws over the reference video. */
export type NumberKind = 'plate' | 'plateLight' | 'coin' | 'whirl' | 'counter' | 'bigwin' | 'ui' | 'title';

/** CSS family name the game font is registered under. */
export const GAME_FONT_FAMILY = 'CVMontserrat';

/** Montserrat cap height / lining digit height as a fraction of the em (font units: 700/1000). */
const DIGIT_HEIGHT_EM = 0.7;

/**
 * Vertical correction (in em) that moves the digit centre onto y = 0. A Pixi Text
 * with anchor 0.5 centres its line box, which sits slightly off the digit centre.
 */
const DIGIT_CENTER_SHIFT_EM = -0.05;

let fontsPromise: Promise<void> | null = null;

/**
 * Registers the game font (Montserrat variable, OFL) via the FontFace API and waits
 * until it is usable, so PixiJS Text renders with it. Safe to call repeatedly.
 * The URL is relative to the site base so it works under a sub-path.
 */
export function loadGameFonts(): Promise<void> {
  if (!fontsPromise) {
    const face = new FontFace(GAME_FONT_FAMILY, 'url("./fonts/Montserrat-Variable.ttf")', {
      weight: '100 900',
      style: 'normal',
    });
    fontsPromise = face.load().then((f) => {
      document.fonts.add(f);
    });
  }
  return fontsPromise;
}

/**
 * Formats a number with explicit separators (no Intl, so output is deterministic).
 * @param value Amount to format.
 * @param opts thousands: group separator; decimal: decimal separator; decimals: fraction digits.
 * @returns e.g. formatMoney(25000, {thousands: ',', decimal: '.', decimals: 2}) gives "25,000.00".
 */
export function formatMoney(
  value: number,
  opts: { thousands: string; decimal: string; decimals: number },
): string {
  const fixed = Math.abs(value).toFixed(opts.decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, opts.thousands);
  return (value < 0 ? '-' : '') + (frac ? grouped + opts.decimal + frac : grouped);
}

interface Layer {
  weight: string;
  /** Gradient stops top to bottom, or a single colour. */
  fill: string | [number, string][];
  strokeColor?: string;
  /** Stroke width in em (only half is visible: the fill is drawn over the inner half). */
  strokeEm?: number;
  shadow?: { color: string; alpha: number; blurEm: number; distEm: number };
  /** Extra tracking in em. */
  spacingEm?: number;
}

const GOLD_FACE: [number, string][] = [[0, '#fff6dc'], [0.5, '#ffe9a8'], [1, '#f0a020']];

/** Outline layer + embossed cream/gold face, shared by coin, whirl and counter. */
function embossed(outline: string): Layer[] {
  return [
    {
      weight: '900',
      spacingEm: 0.03,
      fill: outline,
      strokeColor: outline,
      strokeEm: 0.3,
      shadow: { color: '#2a0400', alpha: 0.55, blurEm: 0.05, distEm: 0.07 },
    },
    { weight: '900', spacingEm: 0.03, fill: GOLD_FACE, strokeColor: '#e0801a', strokeEm: 0.08 },
  ];
}

/** Layers per kind, back to front. */
const SPECS: Record<NumberKind, Layer[]> = {
  // Dark red-brown digits printed on the gold jackpot plates.
  plate: [
    { weight: '900', spacingEm: 0.03, fill: [[0, '#b0301a'], [1, '#6a0e08']], strokeColor: '#ffd060', strokeEm: 0.07 },
  ],
  // White digits with a dark outline on the MAJOR / MINOR / MINI plates.
  plateLight: [
    { weight: '900', spacingEm: 0.03, fill: '#2a0c1e', strokeColor: '#2a0c1e', strokeEm: 0.22 },
    { weight: '900', spacingEm: 0.03, fill: [[0, '#ffffff'], [1, '#f1e6ff']] },
  ],
  coin: embossed('#6e1308'),
  whirl: embossed('#7a1408'),
  counter: embossed('#6a0e08'),
  // Large, lighter-weight white/cream count-up with red outline and warm glow.
  bigwin: [
    {
      weight: '500',
      fill: '#a01005',
      strokeColor: '#a01005',
      strokeEm: 0.16,
      shadow: { color: '#ff8a1a', alpha: 0.7, blurEm: 0.2, distEm: 0 },
    },
    {
      weight: '500',
      fill: [[0, '#ffffff'], [0.55, '#fff4d8'], [1, '#ffc040']],
      strokeColor: '#e02010',
      strokeEm: 0.05,
    },
  ],
  // Plain light sans for Bet / Balance style labels.
  ui: [{ weight: '400', fill: '#d9d4e2' }],
  // Heavy yellow display title (BONUS GAME, SIZZLING).
  title: [
    {
      weight: '900',
      fill: '#8a1004',
      strokeColor: '#8a1004',
      strokeEm: 0.22,
      shadow: { color: '#000000', alpha: 0.4, blurEm: 0.04, distEm: 0.06 },
    },
    {
      weight: '900',
      fill: [[0, '#fff27a'], [0.5, '#ffc21a'], [1, '#ff8a10']],
      strokeColor: '#ffe040',
      strokeEm: 0.06,
    },
  ],
};

function buildStyle(layer: Layer, fontSize: number): TextStyle {
  const fill =
    typeof layer.fill === 'string'
      ? layer.fill
      : new FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: layer.fill.map(([offset, color]) => ({ offset, color })),
          textureSpace: 'local',
        });
  return new TextStyle({
    fontFamily: `${GAME_FONT_FAMILY}, sans-serif`,
    fontWeight: layer.weight as TextStyle['fontWeight'],
    fontSize,
    letterSpacing: (layer.spacingEm ?? 0) * fontSize,
    fill,
    padding: Math.ceil(fontSize * 0.1),
    stroke:
      layer.strokeColor && layer.strokeEm
        ? { color: layer.strokeColor, width: layer.strokeEm * fontSize, join: 'round' }
        : undefined,
    dropShadow: layer.shadow
      ? {
          color: layer.shadow.color,
          alpha: layer.shadow.alpha,
          blur: layer.shadow.blurEm * fontSize,
          distance: layer.shadow.distEm * fontSize,
          angle: Math.PI / 2,
        }
      : undefined,
  });
}

/**
 * Builds a styled number/text for the given kind, centred on (0,0).
 * Layered kinds (outline + embossed face) are a Container of several Text objects
 * sharing the same string; change the string with `setNumberText`.
 * @param kind Style preset.
 * @param text The string to draw (already formatted, e.g. via formatMoney).
 * @param heightPx Digit (cap) height in pixels. fontSize = heightPx / 0.7 (Montserrat cap height).
 * @returns A Container whose children are Text layers, back to front.
 */
export function makeNumber(kind: NumberKind, text: string, heightPx: number): Container {
  const fontSize = heightPx / DIGIT_HEIGHT_EM;
  const root = new Container();
  root.label = `number:${kind}`;
  for (const layer of SPECS[kind]) {
    const t = new Text({ text, style: buildStyle(layer, fontSize) });
    t.anchor.set(0.5, 0.5);
    t.y = DIGIT_CENTER_SHIFT_EM * fontSize;
    root.addChild(t);
  }
  return root;
}

/**
 * Changes the string of a Container created by `makeNumber` (all layers).
 * @param node Container returned by makeNumber.
 * @param text New string.
 */
export function setNumberText(node: Container, text: string): void {
  for (const c of node.children) {
    if (c instanceof Text) c.text = text;
  }
}
