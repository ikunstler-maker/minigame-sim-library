/**
 * Data types and pure helpers for the Coin Volcano video plate.
 * Design: design/stage3-plan.md (timeline of the reference take).
 * No PixiJS or DOM here, so everything is unit-testable.
 */

/** Rectangle in stage px (1080x2340). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point where the plate pauses until the user taps. */
export interface Hold {
  /** Plate time in seconds where playback pauses. */
  t: number;
  /** Where a tap releases the hold. */
  tapArea: Rect | 'anywhere';
  /** What the tap stands for in the take. */
  label: 'spin' | 'bonus-start' | string;
}

/** timeline.json */
export interface PlateTimeline {
  /** Plate length in seconds; `onFinished` fires here (or on `ended`). */
  duration?: number;
  /** Sorted by `t` on load. */
  holds: Hold[];
}

/** One keyframe of an overlay item's motion. Missing fields keep the item's base value. */
export interface TrackKey {
  t: number;
  x: number;
  y: number;
  scale?: number;
  alpha?: number;
}

/** One overlay item in patches.json (a sprite and/or attached content shown for a time range). */
export interface OverlayItem {
  /** Unique id, also passed to `makeContent`. */
  id: string;
  /** Shown from t0 (inclusive) to t1 (exclusive), plate seconds. */
  t0: number;
  t1: number;
  /** Top-left and size in stage px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Image URL relative to the plate dir (e.g. "patches/coin-150.png"). */
  patch?: string;
  /** Fade-in / fade-out length in seconds (0 or absent = hard cut). */
  fadeIn?: number;
  fadeOut?: number;
  /** Optional motion: x/y (top-left), scale, alpha interpolated linearly between keys. */
  track?: TrackKey[];
}

/** Evaluated state of an overlay item at a time. */
export interface OverlayState {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

/** Parse and normalise timeline.json. Throws on a malformed file. */
export function parseTimeline(raw: unknown): PlateTimeline {
  const o = raw as Partial<PlateTimeline> | null;
  if (!o || !Array.isArray(o.holds)) throw new Error('timeline.json: "holds" array missing');
  const holds = o.holds
    .filter((h): h is Hold => typeof h?.t === 'number' && (h.tapArea === 'anywhere' || typeof h.tapArea === 'object'))
    .sort((a, b) => a.t - b.t);
  return { duration: typeof o.duration === 'number' ? o.duration : undefined, holds };
}

/** Accept either `[...]` or `{ items: [...] }`; drop entries without id/t0/t1. */
export function parseOverlayItems(raw: unknown): OverlayItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  return (list as OverlayItem[])
    .filter((i) => i && typeof i.id === 'string' && typeof i.t0 === 'number' && typeof i.t1 === 'number')
    .map((i) => ({ ...i, track: i.track ? [...i.track].sort((a, b) => a.t - b.t) : undefined }));
}

/**
 * Next hold the playhead has reached, or null.
 * @param t        current plate time (s)
 * @param fromIdx  index of the first hold not yet released
 * @param lead     pause this much before `hold.t` to absorb tick jitter (s)
 */
export function reachedHold(holds: Hold[], fromIdx: number, t: number, lead = 0): number | null {
  const h = holds[fromIdx];
  return h && t >= h.t - lead ? fromIdx : null;
}

/** True when the stage point is inside the hold's tap area. */
export function hitsTapArea(area: Hold['tapArea'], x: number, y: number): boolean {
  if (area === 'anywhere') return true;
  return x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Position/scale/alpha of an item at plate time `t` (fades and track applied). */
export function evalOverlay(item: OverlayItem, t: number): OverlayState {
  const hidden: OverlayState = { visible: false, x: item.x, y: item.y, scale: 1, alpha: 0 };
  if (t < item.t0 || t >= item.t1) return hidden;

  let x = item.x, y = item.y, scale = 1, alpha = 1;
  const tr = item.track;
  if (tr && tr.length) {
    let a = tr[0], b = tr[0];
    if (t <= tr[0].t) a = b = tr[0];
    else if (t >= tr[tr.length - 1].t) a = b = tr[tr.length - 1];
    else {
      for (let i = 0; i < tr.length - 1; i++) {
        if (t >= tr[i].t && t < tr[i + 1].t) { a = tr[i]; b = tr[i + 1]; break; }
      }
    }
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    x = lerp(a.x, b.x, k);
    y = lerp(a.y, b.y, k);
    scale = lerp(a.scale ?? 1, b.scale ?? 1, k);
    alpha = lerp(a.alpha ?? 1, b.alpha ?? 1, k);
  }
  if (item.fadeIn && item.fadeIn > 0) alpha *= Math.min(1, (t - item.t0) / item.fadeIn);
  if (item.fadeOut && item.fadeOut > 0) alpha *= Math.min(1, (item.t1 - t) / item.fadeOut);
  return { visible: alpha > 0, x, y, scale, alpha: Math.max(0, Math.min(1, alpha)) };
}
