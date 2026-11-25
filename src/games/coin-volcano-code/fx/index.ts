/**
 * Coin Volcano FX library (PixiJS 8, additive fire look).
 *
 * Every effect is a pure function of scene time `t` (seconds): state is derived from `t - t0`,
 * never from frame counts or wall-clock, so seeking and pausing are safe. Before `t0` an effect is
 * invisible / leaves its target untouched; after `t0 + dur` it hides itself and `isDone(t)` is true.
 *
 * Budget per live effect (sprites): fireTrail 1 rope + 30, fireColumn 1 rope + 47, flare 29,
 * burst 2 + count, screenFlash 3, whirlSpin 27, landingPop / punch 0.
 */
import { Container, MeshRope, Sprite, Texture } from 'pixi.js';
import type { PointData } from 'pixi.js';
import { fireGlowTex, ringTex, ropeTex, raysTex, softDotTex, tongueTex, ROPE_H } from './textures';
import {
  acquire, release, hash, clamp01, lerp, smooth, envelope, fireTint,
  easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine,
} from './util';

/** A time-driven effect. */
export interface Effect {
  /** t = scene time in seconds */
  update(t: number): void;
  /** true after it ended */
  isDone(t: number): boolean;
  destroy(): void;
}

type P = { x: number; y: number };

/** Stage size and the point the full-screen flash rays radiate from (centre cell of the grid). */
export const FX_STAGE = { width: 1080, height: 2340, flashCenter: { x: 541, y: 1112 } };

const TAU = Math.PI * 2;
const GLOW = 256; // fireGlowTex / ringTex size
const DOT = 64; // softDotTex size
const CORE_W = 1.5; // core rope drawn width / requested width (texture profile is narrower than its height)
const HALO_W = 2.6;

/* ------------------------------------------------------------------ trail / column */

interface TrailCfg { width: number; arc: number; travel: number; tongues: number; column: boolean }

/** Flame ribbon (MeshRope) that travels along a quadratic arc, with a hot head and shed embers. */
class Trail implements Effect {
  private root = new Container();
  private holder = new Container();
  private haloHolder = new Container();
  private rope: MeshRope;
  private halo: MeshRope;
  private pts: PointData[] = [];
  private hpts: PointData[] = [];
  private head: Sprite;
  private core: Sprite;
  private impact: Sprite;
  private tongues: Sprite[] = [];
  private embers: Sprite[] = [];
  private sparks: Sprite[] = [];
  private ctrl: P;
  private readonly N = 28;

  constructor(layer: Container, private from: P, private to: P, private t0: number, private dur: number, private c: TrailCfg) {
    layer.addChild(this.root);
    this.root.visible = false;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular offset of the control point; positive arc bends to the left of travel
    this.ctrl = { x: (from.x + to.x) / 2 + (dy / len) * c.arc * len, y: (from.y + to.y) / 2 - (dx / len) * c.arc * len };
    this.holder.scale.set((c.width * CORE_W) / ROPE_H);
    this.haloHolder.scale.set((c.width * HALO_W) / ROPE_H);
    for (let i = 0; i < this.N; i++) {
      this.pts.push({ x: 0, y: 0 });
      this.hpts.push({ x: 0, y: 0 });
    }
    this.halo = new MeshRope({ texture: ropeTex(), points: this.hpts });
    this.halo.blendMode = 'add';
    this.rope = new MeshRope({ texture: ropeTex(), points: this.pts });
    this.rope.blendMode = 'add';
    this.root.addChild(this.haloHolder, this.holder);
    this.haloHolder.addChild(this.halo);
    this.holder.addChild(this.rope);
    for (let i = 0; i < 26; i++) this.embers.push(acquire(softDotTex(), this.root));
    for (let i = 0; i < c.tongues; i++) {
      const tg = acquire(tongueTex(), this.root);
      tg.anchor.set(0.5, 0.9);
      this.tongues.push(tg);
    }
    this.impact = acquire(fireGlowTex(), this.root);
    this.head = acquire(fireGlowTex(), this.root);
    this.core = acquire(softDotTex(), this.root);
    if (c.column) for (let i = 0; i < 14; i++) this.sparks.push(acquire(softDotTex(), this.root));
  }

  private bez(s: number): P {
    const u = 1 - s;
    return {
      x: u * u * this.from.x + 2 * u * s * this.ctrl.x + s * s * this.to.x,
      y: u * u * this.from.y + 2 * u * s * this.ctrl.y + s * s * this.to.y,
    };
  }
  private tangent(s: number): P {
    const x = 2 * (1 - s) * (this.ctrl.x - this.from.x) + 2 * s * (this.to.x - this.ctrl.x);
    const y = 2 * (1 - s) * (this.ctrl.y - this.from.y) + 2 * s * (this.to.y - this.ctrl.y);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  /** head position (path param) at local time lt */
  private headAt(lt: number): number {
    return easeInOutCubic(lt / (this.dur * this.c.travel));
  }

  update(t: number): void {
    const lt = t - this.t0;
    const on = lt >= 0 && lt < this.dur;
    this.root.visible = on;
    if (!on) return;
    const { width, travel } = this.c;
    const u = lt / this.dur;
    const hp = this.headAt(lt);
    const tailLen = 0.65;
    const tp = u < travel ? Math.max(0, hp - tailLen) : lerp(1 - tailLen, 1, easeInCubic((u - travel) / (1 - travel)));
    const fadeOut = u < travel ? 1 : 1 - smooth((u - travel) / (1 - travel));

    // ribbon: hot core rope + wider, wobblier orange halo rope
    const s = (width * CORE_W) / ROPE_H;
    const sh = (width * HALO_W) / ROPE_H;
    const span = hp - tp;
    this.rope.visible = this.halo.visible = span > 0.01;
    for (let i = 0; i < this.N; i++) {
      const f = i / (this.N - 1);
      const sp = tp + span * f;
      const p = this.bez(sp);
      const tg = this.tangent(sp);
      const amp = width * 0.2 * (1 - f) * (0.4 + 0.6 * Math.sin(lt * 3 + f * 2));
      const w = Math.sin(lt * 15 + f * 9.0) * amp + Math.sin(lt * 23 - f * 15) * amp * 0.4;
      const wh = Math.sin(lt * 11 - f * 7.0 + 1.3) * amp * 1.4;
      this.pts[i].x = (p.x - tg.y * w) / s;
      this.pts[i].y = (p.y + tg.x * w) / s;
      this.hpts[i].x = (p.x - tg.y * wh) / sh;
      this.hpts[i].y = (p.y + tg.x * wh) / sh;
    }
    this.rope.alpha = 0.95 * fadeOut + 0.05;
    this.halo.alpha = 0.45 * fadeOut;

    // head glow + hot core
    const hpos = this.bez(hp);
    const flick = 0.85 + 0.15 * Math.sin(lt * 31) * Math.sin(lt * 17 + 1);
    const headA = u < travel ? Math.min(1, lt / 0.08) : fadeOut;
    this.head.visible = this.core.visible = headA > 0.01;
    this.head.position.set(hpos.x, hpos.y);
    this.head.scale.set((width * 3.6 * flick) / GLOW);
    this.head.alpha = 0.9 * headA;
    this.core.position.set(hpos.x, hpos.y);
    this.core.scale.set((width * 0.9 * flick) / DOT);
    this.core.alpha = 0.8 * headA;
    this.core.tint = 0xfff6d8;

    // tongues streaming back from the head
    const dir = this.tangent(hp);
    const back = Math.atan2(-dir.y, -dir.x) + Math.PI / 2;
    this.tongues.forEach((tg, k) => {
      const fl = 0.75 + 0.25 * Math.sin(lt * (11 + 3 * k) + k * 2.1);
      tg.visible = headA > 0.01;
      tg.position.set(hpos.x, hpos.y);
      tg.rotation = back + (k - (this.tongues.length - 1) / 2) * 0.35 + Math.sin(lt * 9 + k) * 0.12;
      tg.scale.set((width * 0.9) / 64, (width * (1.4 + 0.5 * (k % 2)) * fl) / 115);
      tg.alpha = 0.85 * headA;
    });

    // embers shed along the path, drifting up and outward
    const travelT = this.dur * travel;
    this.embers.forEach((e, i) => {
      const born = (i / this.embers.length) * travelT * 0.95 + hash(i, 1) * 0.05;
      const life = 0.4 + 0.35 * hash(i, 2);
      const a = (lt - born) / life;
      if (a < 0 || a >= 1) { e.visible = false; return; }
      const sp = this.headAt(born);
      const o = this.bez(sp);
      const tg = this.tangent(sp);
      const side = hash(i, 3) * 2 - 1;
      const dist = width * (0.3 + 0.9 * hash(i, 4)) * easeOutCubic(a);
      e.visible = true;
      e.position.set(o.x - tg.y * side * dist, o.y + tg.x * side * dist - 70 * a * life * 2);
      const sz = width * (0.12 + 0.12 * hash(i, 5)) * (1 - 0.7 * a);
      e.scale.set(sz / DOT * 2);
      e.tint = fireTint(1 - a);
      e.alpha = Math.pow(1 - a, 1.3);
    });

    // impact glow on the target as the head arrives
    const ia = u < travel - 0.1 ? 0 : Math.sin(Math.PI * clamp01((u - (travel - 0.1)) / (1.1 - travel)));
    this.impact.visible = ia > 0.01;
    this.impact.position.set(this.to.x, this.to.y);
    if (this.c.column) this.impact.scale.set((width * 6) / GLOW, (width * 1.8) / GLOW);
    else this.impact.scale.set((width * 3.2 * (0.8 + 0.4 * ia)) / GLOW);
    this.impact.alpha = 0.9 * ia;

    // column: spark spray where the flame hits the bar
    const st = lt - travelT;
    this.sparks.forEach((sp, i) => {
      const life = 0.35 + 0.25 * hash(i, 7);
      const a = st / life;
      if (a < 0 || a >= 1) { sp.visible = false; return; }
      const ang = -Math.PI / 2 + (hash(i, 8) - 0.5) * 2.6;
      const v = width * (2.5 + 3 * hash(i, 9));
      const d = (v * (1 - Math.exp(-5 * st))) / 5;
      sp.visible = true;
      sp.position.set(this.to.x + Math.cos(ang) * d, this.to.y + Math.sin(ang) * d + 300 * st * st);
      sp.rotation = ang;
      sp.scale.set((width * 0.35 * (1 - a)) / DOT, (width * 0.1) / DOT);
      sp.tint = fireTint(1 - a);
      sp.alpha = 1 - a;
    });
  }

  isDone(t: number): boolean { return t >= this.t0 + this.dur; }

  destroy(): void {
    [...this.embers, ...this.tongues, ...this.sparks, this.head, this.core, this.impact].forEach(release);
    this.rope.destroy();
    this.halo.destroy();
    this.root.destroy({ children: true });
  }
}

/**
 * Curved flame ribbon from `from` to `to` (coin -> Coin Collect whirl). The head travels during the
 * first 80% of `dur`, then the tail is swallowed by the target while it glows.
 * @param opts.width ribbon width in px at the head (default 70)
 * @param opts.arc   sideways bend as a fraction of the distance (default 0.35; negative bends the other way)
 */
export function fireTrail(layer: Container, from: P, to: P, t0: number, dur: number, opts?: { width?: number; arc?: number }): Effect {
  return new Trail(layer, from, to, t0, dur, { width: opts?.width ?? 70, arc: opts?.arc ?? 0.35, travel: 0.8, tongues: 2, column: false });
}

/**
 * Flame comet from a coin down into the total bar: straighter and fatter than fireTrail, ends with a
 * wide bar-shaped impact glow and a spark spray at `to`. Travel takes 65% of `dur`.
 */
export function fireColumn(layer: Container, from: P, to: P, t0: number, dur: number): Effect {
  return new Trail(layer, from, to, t0, dur, { width: 95, arc: 0.06, travel: 0.65, tongues: 3, column: true });
}

/* ------------------------------------------------------------------ flare */

class Flare implements Effect {
  private root = new Container();
  private glow: Sprite;
  private ring: Sprite;
  private tongues: Sprite[] = [];
  private embers: Sprite[] = [];
  constructor(layer: Container, private at: P, private r: number, private t0: number, private dur: number, private pulses: number) {
    layer.addChild(this.root);
    this.root.visible = false;
    this.glow = acquire(fireGlowTex(), this.root);
    for (let i = 0; i < 16; i++) {
      const tg = acquire(tongueTex(), this.root);
      tg.anchor.set(0.5, 0.9);
      this.tongues.push(tg);
    }
    this.ring = acquire(ringTex(), this.root);
    for (let i = 0; i < 11; i++) this.embers.push(acquire(softDotTex(), this.root));
  }
  update(t: number): void {
    const lt = t - this.t0;
    const env = envelope(lt, this.dur, 0.12, 0.3);
    this.root.visible = env > 0;
    if (!env) return;
    const u = lt / this.dur;
    const wave = 0.5 - 0.5 * Math.cos(TAU * this.pulses * u);
    const k = env * (0.6 + 0.4 * wave);
    const { x, y } = this.at;
    const r = this.r;

    this.glow.visible = true;
    this.glow.position.set(x, y);
    this.glow.scale.set((r * 3.4 * (0.9 + 0.15 * wave)) / GLOW);
    this.glow.alpha = 0.42 * k;

    this.ring.visible = true;
    this.ring.position.set(x, y);
    this.ring.scale.set((r * 2.25) / GLOW);
    this.ring.alpha = 0.45 * k;

    const n = this.tongues.length;
    this.tongues.forEach((tg, i) => {
      const a = (i / n) * TAU + lt * 0.5 + (hash(i, 11) - 0.5) * 0.35;
      // each tongue licks up and dies on its own cycle -> ragged, uneven crown
      const per = 0.45 + 0.35 * hash(i, 12);
      const ph = (((lt + hash(i, 15) * per) % per) + per) % per / per;
      const fl = Math.sin(Math.PI * ph);
      const big = 0.6 + 0.7 * hash(i, 16);
      const h = r * (0.25 + 0.55 * fl) * big * (0.75 + 0.25 * wave) * Math.min(1, env * 1.5);
      tg.visible = true;
      tg.position.set(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
      tg.rotation = a + Math.PI / 2 + (ph - 0.5) * 0.5;
      tg.scale.set((r * (0.55 + 0.25 * big)) / 64, h / 115);
      tg.alpha = 0.85 * env * (0.4 + 0.6 * fl);
    });

    const period = 0.8;
    this.embers.forEach((e, i) => {
      const a = (((lt + hash(i, 13) * period) % period) + period) % period / period;
      const ang = hash(i, 14) * TAU;
      const d = r * (0.95 + 0.7 * a);
      e.visible = true;
      e.position.set(x + Math.cos(ang) * d, y + Math.sin(ang) * d - r * 0.6 * a);
      e.scale.set((r * 0.11 * (1 - 0.6 * a)) / DOT * 2);
      e.tint = fireTint(1 - a);
      e.alpha = env * Math.sin(Math.PI * a);
    });
  }
  isDone(t: number): boolean { return t >= this.t0 + this.dur; }
  destroy(): void {
    [this.glow, this.ring, ...this.tongues, ...this.embers].forEach(release);
    this.root.destroy({ children: true });
  }
}

/**
 * Glow pulse + licking flame tongues around a coin (bonus trigger).
 * @param radius coin radius in px; @param opts.pulses number of brightness pulses over `dur` (default 2)
 */
export function flare(layer: Container, at: P, radius: number, t0: number, dur: number, opts?: { pulses?: number }): Effect {
  return new Flare(layer, at, radius, t0, dur, opts?.pulses ?? 2);
}

/* ------------------------------------------------------------------ scale effects */

/** Animates `target.scale` as base x f(u) inside [t0, t0+dur); restores base outside it. */
class ScaleFx implements Effect {
  private bx: number;
  private by: number;
  private dirty = false;
  constructor(private target: Container, private t0: number, private dur: number, private f: (u: number) => number, private hold: number | null) {
    this.bx = target.scale.x;
    this.by = target.scale.y;
  }
  update(t: number): void {
    const lt = t - this.t0;
    if (lt >= 0 && lt < this.dur) {
      const k = this.f(lt / this.dur);
      this.target.scale.set(this.bx * k, this.by * k);
      this.dirty = true;
    } else if (lt >= this.dur && this.hold !== null) {
      this.target.scale.set(this.bx * this.hold, this.by * this.hold);
      this.dirty = true;
    } else if (this.dirty) {
      this.target.scale.set(this.bx, this.by);
      this.dirty = false;
    }
  }
  isDone(t: number): boolean { return t >= this.t0 + this.dur; }
  destroy(): void {
    if (this.hold === null && this.dirty && !this.target.destroyed) this.target.scale.set(this.bx, this.by);
  }
}

/**
 * Coin landing pop on the target's own scale: 1.25 -> 0.95 -> 1 (relative to its scale at creation).
 * @param dur seconds (default 0.35)
 */
export function landingPop(target: Container, t0: number, dur = 0.35): Effect {
  return new ScaleFx(target, t0, dur, (u) =>
    u < 0.4 ? lerp(1.25, 0.95, easeInOutSine(u / 0.4)) : lerp(0.95, 1, easeOutCubic((u - 0.4) / 0.6)), null);
}

/**
 * Scale punch with damped overshoot (X4 multiplier): `from` -> `to`, both multipliers of the target's
 * scale at creation. Before t0 the target keeps its base scale; after t0+dur it HOLDS `to`
 * (destroy() does not reset it, so FxRunner removal keeps the final size).
 */
export function punch(target: Container, t0: number, dur: number, from: number, to: number): Effect {
  return new ScaleFx(target, t0, dur, (u) => to + (from - to) * Math.exp(-5 * u) * Math.cos(2.5 * Math.PI * u), to);
}

/* ------------------------------------------------------------------ burst */

class Burst implements Effect {
  private root = new Container();
  private flash: Sprite;
  private ring: Sprite;
  private sparks: Sprite[] = [];
  readonly dur = 0.8;
  constructor(layer: Container, private at: P, private t0: number, private r: number, count: number) {
    layer.addChild(this.root);
    this.root.visible = false;
    this.flash = acquire(fireGlowTex(), this.root);
    this.ring = acquire(ringTex(), this.root);
    for (let i = 0; i < count; i++) this.sparks.push(acquire(softDotTex(), this.root));
  }
  update(t: number): void {
    const lt = t - this.t0;
    const on = lt >= 0 && lt < this.dur;
    this.root.visible = on;
    if (!on) return;
    const { x, y } = this.at;
    const r = this.r;
    const fa = Math.min(1, lt / 0.05) * Math.exp(-6 * Math.max(0, lt - 0.05));
    this.flash.visible = true;
    this.flash.position.set(x, y);
    this.flash.scale.set((r * 2.6 * (0.8 + 0.4 * easeOutCubic(lt / 0.2))) / GLOW);
    this.flash.alpha = fa;

    const ra = clamp01(lt / 0.5);
    this.ring.visible = ra < 1;
    this.ring.position.set(x, y);
    this.ring.scale.set((r * lerp(0.4, 2.3, easeOutCubic(ra))) / GLOW);
    this.ring.alpha = Math.pow(1 - ra, 1.2);

    const n = this.sparks.length;
    this.sparks.forEach((s, i) => {
      const life = 0.45 + 0.3 * hash(i, 21);
      const a = lt / life;
      if (a >= 1) { s.visible = false; return; }
      const ang = (i / n) * TAU + (hash(i, 22) - 0.5) * 0.5;
      const v = r * (2.4 + 2.2 * hash(i, 23));
      const d = r * 0.25 + (v * (1 - Math.exp(-4 * lt))) / 4;
      const vx = Math.cos(ang) * v * Math.exp(-4 * lt);
      const vy = Math.sin(ang) * v * Math.exp(-4 * lt) + 360 * lt;
      s.visible = true;
      s.position.set(x + Math.cos(ang) * d, y + Math.sin(ang) * d + 180 * lt * lt);
      s.rotation = Math.atan2(vy, vx);
      const sp = Math.hypot(vx, vy);
      s.scale.set((10 + sp * 0.06) * (1 - 0.5 * a) / DOT * 2, (9 * (1 - 0.6 * a)) / DOT * 2);
      s.tint = fireTint(1 - a * 0.9);
      s.alpha = 1 - a;
    });
  }
  isDone(t: number): boolean { return t >= this.t0 + this.dur; }
  destroy(): void {
    [this.flash, this.ring, ...this.sparks].forEach(release);
    this.root.destroy({ children: true });
  }
}

/**
 * Spark spray + expanding hot ring + flash (Mystery reveal, respin land). Lasts 0.8 s.
 * @param opts.radius size in px (default 130); @param opts.count number of sparks (default 18)
 */
export function burst(layer: Container, at: P, t0: number, opts?: { radius?: number; count?: number }): Effect {
  return new Burst(layer, at, t0, opts?.radius ?? 130, opts?.count ?? 18);
}

/* ------------------------------------------------------------------ screen flash */

class ScreenFlash implements Effect {
  private root = new Container();
  private fill: Sprite;
  private glow: Sprite;
  private rays: Sprite;
  constructor(layer: Container, private t0: number, private dur: number, color: number) {
    layer.addChild(this.root);
    this.root.visible = false;
    this.fill = acquire(Texture.WHITE, this.root);
    this.fill.anchor.set(0);
    this.fill.width = FX_STAGE.width;
    this.fill.height = FX_STAGE.height;
    this.fill.tint = color;
    this.rays = acquire(raysTex(), this.root);
    this.glow = acquire(fireGlowTex(), this.root);
  }
  update(t: number): void {
    const lt = t - this.t0;
    const on = lt >= 0 && lt < this.dur;
    this.root.visible = on;
    if (!on) return;
    const u = lt / this.dur;
    const a = u < 0.1 ? u / 0.1 : Math.exp(-4.5 * (u - 0.1) / 0.9) * (1 - smooth((u - 0.85) / 0.15));
    const { x, y } = FX_STAGE.flashCenter;
    this.fill.visible = true;
    this.fill.alpha = 0.7 * a;
    this.rays.visible = true;
    this.rays.position.set(x, y);
    this.rays.rotation = lt * 0.35;
    this.rays.scale.set((1900 * lerp(0.6, 1.15, easeOutCubic(u * 2))) / 512);
    this.rays.alpha = a;
    this.glow.visible = true;
    this.glow.position.set(x, y);
    this.glow.scale.set(1300 / GLOW);
    this.glow.alpha = a;
  }
  isDone(t: number): boolean { return t >= this.t0 + this.dur; }
  destroy(): void {
    [this.fill, this.glow, this.rays].forEach(release);
    this.root.destroy({ children: true });
  }
}

/**
 * Full-stage additive flash (1080x2340) with a rotating starburst at FX_STAGE.flashCenter.
 * Attack is 10% of `dur`, then an exponential decay. @param color tint (default warm yellow 0xffd890)
 */
export function screenFlash(layer: Container, t0: number, dur: number, color = 0xffd890): Effect {
  return new ScreenFlash(layer, t0, dur, color);
}

/* ------------------------------------------------------------------ whirl */

class WhirlSpin implements Effect {
  private glow: Sprite | null = null;
  private front = new Container();
  private back = new Container();
  private embers: Sprite[] = [];
  private baseRot: number;
  private bx: number;
  private by: number;
  private size = 0;
  constructor(private sprite: Container, private t0: number, private tps: number, private pulse: boolean) {
    this.baseRot = sprite.rotation;
    this.bx = sprite.scale.x;
    this.by = sprite.scale.y;
    this.front.visible = this.back.visible = false;
  }
  private attach(): boolean {
    const parent = this.sprite.parent;
    if (!parent) return false;
    if (this.back.parent !== parent) {
      parent.addChildAt(this.back, parent.getChildIndex(this.sprite));
      parent.addChildAt(this.front, parent.getChildIndex(this.sprite) + 1);
      if (!this.glow) {
        this.glow = acquire(fireGlowTex(), this.back);
        for (let i = 0; i < 26; i++) this.embers.push(acquire(softDotTex(), this.front));
      }
    }
    if (!this.size) {
      const b = this.sprite.getLocalBounds();
      this.size = Math.max(b.width * Math.abs(this.bx), b.height * Math.abs(this.by));
    }
    return this.size > 0;
  }
  update(t: number): void {
    const lt = t - this.t0;
    if (lt < 0) {
      this.sprite.rotation = this.baseRot;
      if (this.pulse) this.sprite.scale.set(this.bx, this.by);
      this.front.visible = this.back.visible = false;
      return;
    }
    this.sprite.rotation = this.baseRot + TAU * this.tps * lt;
    const pk = this.pulse ? 1 + 0.035 * Math.sin(TAU * 1.4 * lt) : 1;
    if (this.pulse) this.sprite.scale.set(this.bx * pk, this.by * pk);
    if (!this.attach() || !this.glow) return;
    this.front.visible = this.back.visible = true;
    const { x, y } = this.sprite.position;
    const R = this.size / 2;
    const fadeIn = Math.min(1, lt / 0.3);
    this.glow.visible = true;
    this.glow.position.set(x, y);
    this.glow.scale.set((this.size * 1.7 * pk) / GLOW);
    this.glow.alpha = fadeIn * (0.55 + 0.15 * Math.sin(TAU * 1.4 * lt));
    const dirSign = this.tps >= 0 ? 1 : -1;
    this.embers.forEach((e, i) => {
      const inward = i < 18;
      const period = inward ? 1.1 : 0.8;
      const a = ((((lt + hash(i, 31) * period) % period) + period) % period) / period;
      const ang0 = hash(i, 32) * TAU;
      let r: number, ang: number;
      if (inward) {
        r = R * lerp(1.2, 0.25, easeInCubic(a));
        ang = ang0 + dirSign * (a * 3.5 + TAU * Math.abs(this.tps) * lt);
      } else {
        r = R * lerp(0.85, 1.6, easeOutCubic(a));
        ang = ang0 + dirSign * TAU * Math.abs(this.tps) * lt;
      }
      e.visible = true;
      e.position.set(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      const sz = R * (inward ? 0.07 : 0.09) * (inward ? 0.5 + a : 1 - 0.7 * a);
      e.scale.set(sz / DOT * 2);
      e.tint = fireTint(inward ? 0.4 + 0.6 * a : 1 - a);
      e.alpha = fadeIn * (inward ? Math.sin(Math.PI * a) : 1 - a);
    });
  }
  /** Runs until destroyed (no duration). */
  isDone(_t: number): boolean { return false; }
  destroy(): void {
    if (this.glow) release(this.glow);
    this.embers.forEach(release);
    this.front.destroy({ children: true });
    this.back.destroy({ children: true });
    if (!this.sprite.destroyed) {
      this.sprite.rotation = this.baseRot;
      this.sprite.scale.set(this.bx, this.by);
    }
  }
}

/**
 * Coin Collect whirl: spins `sprite` about its origin (use a centred anchor/pivot), adds a glow
 * behind it and embers spiralling in / sparks flung out, inserted next to it in its parent.
 * Never finishes on its own (isDone is always false); destroy() restores rotation and scale.
 * @param opts.turnsPerSecond default 0.6 (negative = counter-clockwise); @param opts.pulse scale breathing (default true)
 */
export function whirlSpin(sprite: Container, t0: number, opts?: { turnsPerSecond?: number; pulse?: boolean }): Effect {
  return new WhirlSpin(sprite, t0, opts?.turnsPerSecond ?? 0.6, opts?.pulse ?? true);
}

/* ------------------------------------------------------------------ runner */

/** Runs a list of effects; call update(t) every frame; removes finished ones. */
export class FxRunner {
  private list: Effect[] = [];
  /** Register an effect; returns it for chaining. */
  add(e: Effect): Effect {
    this.list.push(e);
    return e;
  }
  /** Update all effects at scene time t, then destroy and drop the ones that are done. */
  update(t: number): void {
    for (const e of this.list) e.update(t);
    const keep: Effect[] = [];
    for (const e of this.list) {
      if (e.isDone(t)) e.destroy();
      else keep.push(e);
    }
    this.list = keep;
  }
  /** Destroy every effect. */
  clear(): void {
    for (const e of this.list) e.destroy();
    this.list = [];
  }
}
