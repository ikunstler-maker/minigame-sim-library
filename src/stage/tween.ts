import type { Ticker } from 'pixi.js';

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Slight overshoot, close to the iOS app-open spring. */
export const easeOutBack = (t: number) => {
  const c1 = 1.2, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * Run `step(k)` with k going 0→1 over `ms` on the given ticker. Resolves when done.
 * Driven by the ticker so it stays in sync with recorded frames.
 */
export function tween(ticker: Ticker, ms: number, step: (k: number) => void, ease = easeOutCubic): Promise<void> {
  return new Promise((resolve) => {
    let t = 0;
    const fn = (tk: Ticker) => {
      t += tk.deltaMS;
      const k = Math.min(1, t / ms);
      step(ease(k));
      if (k >= 1) {
        ticker.remove(fn);
        resolve();
      }
    };
    ticker.add(fn);
  });
}
