/**
 * Data model of the Coin Volcano "code" take: script.json (timeline as data) and
 * layout.json (board geometry). Every gameplay number lives in those files; this
 * module only types them, supplies geometry fallbacks and evaluates cell state at
 * a scene time. Design: design/stage3b-code-plan.md.
 */

/** Symbol reference: `sym` is a key of `script.symbols`, `value` a value key (see values.ts). */
export interface SymRef { sym: string; value?: string }

/** A cell becomes `sym` (or empty when sym is absent/null) at time t. */
export interface StaticEvent { t: number; sym?: string | null; value?: string }

/** The cell spins from spin[0] to spin[1] and stops on `land` (absent/null = empty). */
export interface SpinEvent { spin: [number, number]; land?: SymRef | null; blank?: boolean }

export type CellEvent = StaticEvent | SpinEvent;

export interface SymbolDef { file: string; artR: number; drawR?: number; text: string; fallback?: string }
export interface ValueEntry { key: string; label: string; default: number; decimals?: number }
export interface Insert { t0: number; t1: number; fadeIn: number; fadeOut: number }
export interface HoldDef { t: number; tap: 'spin' | 'anywhere'; label: string }
export interface Window { cell: string; t0: number; t1: number }

export interface BoardScript {
  cells: Record<string, CellEvent[]>;
  anticipation?: Window[];
  spinButtonRotate?: [number, number][];
  trigger?: { t0: number; dur: number; cells: string[] };
  respinCounter?: { t: number; n: number }[];
  pips?: { count: number };
}

export interface CodeScript {
  version: number;
  duration: number;
  media: {
    video: string; audio: string; layout: string; bigWinLabel?: string;
    layers: Record<'bgBase' | 'bgBonus' | 'spinButton' | 'spinButtonBonus' | 'totalBar' | 'pips' | 'pipOff', string>;
  };
  symbols: Record<string, SymbolDef>;
  values: ValueEntry[];
  text: {
    coinHeight: number; whirlHeight: number; multiplierTemplate: string; multiplierKind: string;
    multiplierHeight: number; spinCounterKind: string; spinCounterHeight: number;
    /** Max text widths (px) / fractions; the free font is wider than the game's. */
    fit?: { plate?: number; bet?: number; balance?: number; coinFrac?: number; barFrac?: number; bigWinFrac?: number };
  };
  strip: { speed: number; symbols: string[]; betMultiples: number[] };
  bounce: { dur: number; amp: number };
  holds: HoldDef[];
  inserts: Insert[];
  boardSwitch: number;
  boards: { base: BoardScript; bonus: BoardScript };
  balance: { t: number; value: string }[];
  whirl: {
    cell: string; value: string; activate: { t: number; dur: number }; trailDur: number;
    collect: { t: number; from: string; value: string }[];
  };
  multiplier: {
    cell: string; value: string; t: number; settle: number; burst: number;
    flash: { t: number; dur: number }; hideCoinValue: boolean;
  };
  dim: { global: { t0: number; t1: number; to: number }[]; collected: number; collectedFade: number };
  collect: { bar: { t0: number; t1: number; fade: number }; trailDur: number; order: { cell: string; t: number; value: string }[] };
  bigWin: {
    t0: number; t1: number; fade: number; countT0: number; countT1: number; fromRatio: number;
    cx: number; cy: number; height: number; label: { x: number; y: number; w: number; h: number };
  };
  balanceBacking: { w: number; h: number; color: string };
  /** Halo behind value coins: diameter = coin diameter x scale. */
  glow?: { symbols: string[]; scale: number; alpha: number };
}

// ------------------------------------------------------------------ layout

export interface TextPos { cx: number; cy: number; height: number }
export interface BoardLayout {
  cells: { x: number[]; y: number[] };
  coinR: number;
  plates: Record<'grand' | 'major' | 'minor' | 'mini', TextPos>;
  bet: TextPos;
  win?: TextPos;
  balance: TextPos;
  spin: { cx: number; cy: number; r: number };
  totalBar?: { x: number; y: number; w: number; h: number; textCx: number; textCy: number; textHeight: number };
  pips?: { x: number; y: number; w: number; h: number };
}
export interface CodeLayout { base: BoardLayout; bonus: BoardLayout }

/**
 * Geometry used when layout.json (produced by the layer pipeline) is missing or
 * partial. Measured on the reference take (stage px); see plate/patches.json.
 */
export const FALLBACK_LAYOUT: CodeLayout = {
  base: {
    cells: { x: [217, 539, 862], y: [679, 929, 1174] },
    coinR: 140,
    plates: {
      grand: { cx: 206, cy: 343, height: 60 }, major: { cx: 881, cy: 349.5, height: 53 },
      minor: { cx: 181, cy: 499.5, height: 53 }, mini: { cx: 905, cy: 499.5, height: 47 },
    },
    bet: { cx: 1029, cy: 1569, height: 44 },
    balance: { cx: 540.5, cy: 2002.5, height: 41 },
    spin: { cx: 541, cy: 1621, r: 113 },
  },
  bonus: {
    cells: { x: [208, 541, 873], y: [855, 1112, 1369] },
    coinR: 140,
    plates: {
      grand: { cx: 206, cy: 512.5, height: 63 }, major: { cx: 881, cy: 518.5, height: 51 },
      minor: { cx: 181, cy: 669.5, height: 49 }, mini: { cx: 905, cy: 670.5, height: 45 },
    },
    bet: { cx: 1029, cy: 1640.5, height: 39 },
    balance: { cx: 540.5, cy: 2002.5, height: 41 },
    spin: { cx: 540, cy: 1690, r: 100 },
    totalBar: { x: 335, y: 1416, w: 425, h: 78, textCx: 544.5, textCy: 1454, textHeight: 48 },
    pips: { x: 330, y: 1455, w: 420, h: 52 },
  },
};

/** Deep-merge a (possibly partial) layout.json over the fallback. */
export function mergeLayout(raw: unknown): CodeLayout {
  const out: CodeLayout = JSON.parse(JSON.stringify(FALLBACK_LAYOUT));
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<Record<'base' | 'bonus', Partial<BoardLayout>>>;
  for (const b of ['base', 'bonus'] as const) {
    const src = r[b];
    if (!src || typeof src !== 'object') continue;
    const dst = out[b] as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null) continue;
      const cur = dst[k];
      dst[k] = cur && typeof cur === 'object' && !Array.isArray(cur) && typeof v === 'object' && !Array.isArray(v)
        ? { ...(cur as object), ...(v as object) }
        : v;
    }
  }
  return out;
}

// ------------------------------------------------------------------ cell evaluation

/** "r1c2" -> [1, 2]. */
export function parseCell(id: string): [number, number] {
  const m = /^r(\d)c(\d)$/.exec(id);
  if (!m) throw new Error(`bad cell id ${id}`);
  return [Number(m[1]), Number(m[2])];
}

export const CELL_IDS = ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r1c2', 'r2c0', 'r2c1', 'r2c2'];

export function isSpin(e: CellEvent): e is SpinEvent {
  return Array.isArray((e as SpinEvent).spin);
}

/** One symbol visible in a cell; `dy` is the offset from the cell centre in cell pitches. */
export interface StripItem { sym: SymRef | null; dy: number; filler: number }

/** State of one cell at scene time t. */
export type CellState =
  | { kind: 'rest'; sym: SymRef | null; landT: number | null }
  | { kind: 'spin'; items: StripItem[] };

/**
 * Evaluate a cell's event list at time t. Spins are reels: item 0 is the symbol the
 * cell held before, item L the landing symbol; items in between are decorative
 * fillers (index returned as `filler`, -1 for real symbols / blanks).
 */
export function cellStateAt(events: CellEvent[], t: number, speed: number): CellState {
  let cur: SymRef | null = null;
  let landT: number | null = null;
  for (const e of events) {
    if (isSpin(e)) {
      const [a, b] = e.spin;
      if (t < a) break;
      if (t < b) {
        const L = Math.max(1, Math.round((b - a) * speed));
        const p = (L * (t - a)) / (b - a);
        const items: StripItem[] = [];
        for (let j = Math.max(0, Math.floor(p) - 1); j <= Math.min(L, Math.ceil(p) + 1); j++) {
          const dy = p - j;
          if (Math.abs(dy) >= 1) continue;
          let sym: SymRef | null;
          let filler = -1;
          if (j === 0) sym = cur;
          else if (j === L) sym = e.land ?? null;
          else if (e.blank) sym = null;
          else { sym = null; filler = j; }
          items.push({ sym, dy, filler });
        }
        return { kind: 'spin', items };
      }
      cur = e.land ?? null;
      landT = cur ? b : null;
    } else {
      if (t < e.t) break;
      cur = e.sym ? { sym: e.sym, value: e.value } : null;
      landT = null;
    }
  }
  return { kind: 'rest', sym: cur, landT };
}

/** Insert visibility (0..1) at t, including its fades. */
export function insertAlpha(ins: Insert, t: number): number {
  if (t < ins.t0 || t > ins.t1 + ins.fadeOut) return 0;
  if (ins.fadeIn > 0 && t < ins.t0 + ins.fadeIn) return (t - ins.t0) / ins.fadeIn;
  if (t > ins.t1) return ins.fadeOut > 0 ? 1 - (t - ins.t1) / ins.fadeOut : 0;
  return 1;
}

/** Last entry of a time-sorted list with entry.t <= t (or undefined). */
export function lastAt<T extends { t: number }>(list: readonly T[], t: number): T | undefined {
  let r: T | undefined;
  for (const e of list) if (e.t <= t) r = e;
  return r;
}

/** Index of the last entry with entry.t <= t, -1 when none. */
export function stepIndex(list: readonly { t: number }[], t: number): number {
  let r = -1;
  list.forEach((e, i) => { if (e.t <= t) r = i; });
  return r;
}
