/** Small deterministic math + sprite-pool helpers for the FX library. */
import { Container, Sprite, Texture } from 'pixi.js';

/** Deterministic pseudo-random in [0,1) from two integers/floats (no state, seek-safe). */
export function hash(i: number, k = 0): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
export const smooth = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInCubic = (x: number): number => Math.pow(clamp01(x), 3);
export const easeInOutCubic = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;

/** Fire-ramp tint: 0 -> deep red, 0.5 -> orange, 1 -> yellow-white (as 0xRRGGBB). */
export function fireTint(h: number): number {
  const x = clamp01(h);
  const r = 255;
  const g = Math.round(lerp(60, 235, x));
  const b = Math.round(lerp(10, 170, x * x));
  return (r << 16) | (g << 8) | b;
}

/** Envelope: 0 before 0, fades in over `fin`, holds, fades out over `fout` before `dur`. */
export function envelope(lt: number, dur: number, fin: number, fout: number): number {
  if (lt < 0 || lt >= dur) return 0;
  return Math.min(1, fin > 0 ? lt / fin : 1, fout > 0 ? (dur - lt) / fout : 1);
}

const pool: Sprite[] = [];
const POOL_MAX = 512;

/** Take an additive, centred, hidden sprite from the pool and attach it to `parent`. */
export function acquire(tex: Texture, parent: Container): Sprite {
  const s = pool.pop() ?? new Sprite();
  s.texture = tex;
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.alpha = 1;
  s.tint = 0xffffff;
  s.rotation = 0;
  s.scale.set(1);
  s.position.set(0, 0);
  s.visible = false;
  parent.addChild(s);
  return s;
}

/** Return a sprite to the pool (detaches it). */
export function release(s: Sprite): void {
  s.removeFromParent();
  if (pool.length < POOL_MAX) pool.push(s);
  else s.destroy();
}
