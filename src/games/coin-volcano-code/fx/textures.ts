/**
 * Runtime-generated FX textures (canvas -> Texture), created lazily once and cached.
 * All colours follow the fire ramp: hot yellow-white core -> orange -> deep red edge.
 */
import { Texture } from 'pixi.js';

const cache = new Map<string, Texture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = Texture.from(c);
  cache.set(key, tex);
  return tex;
}

/** Fire colour ramp, heat 0 (deep red) .. 1 (yellow-white). Returns [r,g,b] 0..255. */
export function heatRgb(h: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0.0, 110, 8, 0],
    [0.35, 215, 45, 5],
    [0.6, 255, 135, 18],
    [0.8, 255, 212, 85],
    [1.0, 255, 252, 232],
  ];
  const x = Math.min(1, Math.max(0, h));
  for (let i = 1; i < stops.length; i++) {
    const [p1, r1, g1, b1] = stops[i];
    const [p0, r0, g0, b0] = stops[i - 1];
    if (x <= p1) {
      const f = (x - p0) / (p1 - p0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [255, 252, 232];
}

/** Fill an ImageData pixel by pixel from an intensity function (0..1), mapped through the fire ramp. */
function fillHeat(ctx: CanvasRenderingContext2D, w: number, h: number, f: (x: number, y: number) => number): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(1, f(x, y)));
      const [r, g, b] = heatRgb(v);
      const o = (y * w + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = Math.round(255 * Math.min(1, v * 1.6));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** 256x256 radial fire glow: white core, orange body, red fringe, transparent edge. */
export const fireGlowTex = (): Texture =>
  make('fireGlow', 256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,253,235,1)');
    g.addColorStop(0.14, 'rgba(255,232,140,0.95)');
    g.addColorStop(0.36, 'rgba(255,150,35,0.6)');
    g.addColorStop(0.62, 'rgba(215,50,8,0.25)');
    g.addColorStop(1, 'rgba(110,8,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

/** 64x64 white soft dot (tint it). Used for sparks and embers. */
export const softDotTex = (): Texture =>
  make('softDot', 64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

/** 256x256 thin hot ring (outer radius = half the texture). */
export const ringTex = (): Texture =>
  make('ring', 256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,120,20,0)');
    g.addColorStop(0.62, 'rgba(255,120,20,0.08)');
    g.addColorStop(0.8, 'rgba(255,236,160,1)');
    g.addColorStop(0.88, 'rgba(255,140,30,0.6)');
    g.addColorStop(1, 'rgba(150,15,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

/** Flame tongue, 64x128, tip at the top, base near the bottom (use anchor (0.5, 0.9)). */
export const tongueTex = (): Texture =>
  make('tongue', 64, 128, (ctx, w, h) =>
    fillHeat(ctx, w, h, (x, y) => {
      const v = 1 - y / h; // 0 base .. 1 tip
      const hw = (w / 2) * 0.95 * Math.pow(1 - v, 0.75) * Math.min(1, (v + 0.08) * 5);
      if (hw <= 0.5) return 0;
      const d = Math.abs(x + 0.5 - w / 2) / hw;
      if (d >= 1) return 0;
      return Math.pow(1 - d * d, 0.8) * (1 - Math.pow(v, 1.2)) * 0.82;
    }),
  );

/** Rope height in px; the rope width is set by scaling a holder (see fireTrail). */
export const ROPE_H = 128;

/** 256xROPE_H flame ribbon: u=0 tail (thin, faded) .. u=1 head (wide, hot). */
export const ropeTex = (): Texture =>
  make('rope', 256, ROPE_H, (ctx, w, h) =>
    fillHeat(ctx, w, h, (x, y) => {
      const u = x / (w - 1);
      const hwf = 0.3 + 0.7 * Math.pow(u, 0.6);
      const d = Math.abs(y + 0.5 - h / 2) / ((h / 2) * hwf);
      if (d >= 1) return 0;
      const lenA = Math.min(1, u / 0.25);
      const lenA2 = lenA * lenA * (3 - 2 * lenA);
      return Math.pow(1 - d * d, 0.7) * lenA2 * (0.6 + 0.45 * u);
    }),
  );

/** 512x512 starburst rays with a soft centre, for the full-screen flash. */
export const raysTex = (): Texture =>
  make('rays', 512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.translate(c, c);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(0.35, 'rgba(255,205,90,0.75)');
    g.addColorStop(0.7, 'rgba(255,130,25,0.3)');
    g.addColorStop(1, 'rgba(200,40,0,0)');
    ctx.fillStyle = g;
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.31) * 0.08;
      const len = c * (0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898) * 1.7 % 1));
      const half = 0.035 + 0.03 * Math.abs(Math.sin(i * 4.1));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, len, a - half, a + half);
      ctx.closePath();
      ctx.fill();
    }
  });
