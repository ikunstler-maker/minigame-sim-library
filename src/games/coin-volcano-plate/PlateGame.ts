import { Assets, Container, Graphics, Rectangle, Sprite, Ticker, type FederatedPointerEvent, type Texture } from 'pixi.js';
import type { AudioBus } from '../../audio/AudioBus';
import { STAGE_H, STAGE_W } from '../../config';
import type { GamePlugin } from '../_engine/GamePlugin';
import { PlateAudio } from './PlateAudio';
import { PlateVideo } from './PlateVideo';
import { TimedOverlay, type MakeContent } from './TimedOverlay';
import { hitsTapArea, parseOverlayItems, parseTimeline, reachedHold, type Hold, type PlateTimeline } from './timeline';

/**
 * Coin Volcano as a "video plate": the reference take (plate.mp4) plays as a
 * texture, pauses at holds from timeline.json until the user taps, and time-keyed
 * overlays (patches.json) sit above it. Design: design/stage3-plan.md.
 *
 * State machine (explicit transitions):
 *   loading -> ready            load() resolved
 *   ready   -> playing          start(), play() accepted
 *   ready   -> blocked          start(), play() rejected (autoplay blocked)
 *   blocked -> playing          any tap, play() accepted
 *   playing -> holding          playhead reached the next hold
 *   holding -> playing          tap inside the hold's tapArea, play() accepted
 *   holding -> blocked          tap accepted but play() rejected
 *   playing -> finished         video ended or duration reached -> onFinished()
 */
export type PlateState = 'loading' | 'ready' | 'playing' | 'holding' | 'blocked' | 'finished';

/** Construction options. Every URL defaults to a file inside `baseUrl`. */
export interface PlateGameOptions {
  /** Plate directory, ending with '/'. Default './private/coin-volcano/plate/'. */
  baseUrl?: string;
  /** Route the soundtrack through this bus. Absent = silent. */
  audio?: AudioBus | null;
  /** Soundtrack URL; default baseUrl + 'audio.m4a'. null = silent. Missing file = silent. */
  audioUrl?: string | null;
  /** Default baseUrl + 'timeline.json' (required). */
  timelineUrl?: string;
  /** Default baseUrl + 'patches.json' (optional; missing = no overlays). */
  patchesUrl?: string;
  /** Default baseUrl + 'plate.mp4'. */
  videoUrl?: string;
  /** Default baseUrl + 'poster.jpg' (shown until the first video frame is on the GPU). */
  posterUrl?: string;
  /** Attach content (e.g. number text) to each overlay item. */
  makeContent?: MakeContent;
  /** Ticker to run on. Default Ticker.shared. Ignored when autoTick is false. */
  ticker?: Ticker;
  /** Attach `update` to the ticker automatically (default true). Set false to call `update(dtMs)` yourself. */
  autoTick?: boolean;
  /** Draw the active tap area (dev aid). Default false. */
  showTapAreas?: boolean;
  /** Audio/video drift that triggers an audio re-sync, seconds. Default 0.08. */
  maxDriftS?: number;
}

const DEFAULT_BASE = './private/coin-volcano/plate/';
/** Pause this much before a hold to absorb tick jitter, then seek exactly onto it. */
const HOLD_LEAD_S = 1 / 60;

/** The Coin Volcano plate game. See `GamePlugin` for the lifecycle. */
export class PlateGame extends Container implements GamePlugin {
  /** Fired once when the take ends. */
  onFinished: () => void = () => {};
  /** Fired when playback pauses on a hold. */
  onHold: (hold: Hold) => void = () => {};
  /** Fired when a tap releases a hold. */
  onRelease: (hold: Hold) => void = () => {};

  /** Layer above the video for number overlays; TimedOverlay lives in here. */
  readonly overlay = new Container({ label: 'plate-overlay' });

  private readonly opts: PlateGameOptions;
  private readonly base: string;
  private readonly video: PlateVideo;
  private readonly sound: PlateAudio;
  private readonly videoSprite: Sprite;
  private poster: Sprite | null = null;
  private timed: TimedOverlay | null = null;
  private tapDebug = new Graphics();
  private timeline: PlateTimeline = { holds: [] };
  private nextHold = 0;
  private activeHold: Hold | null = null;
  private _state: PlateState = 'loading';
  private ticker: Ticker | null = null;
  private lastDriftCheck = 0;

  constructor(opts: PlateGameOptions = {}) {
    super({ label: 'plate-game' });
    this.opts = opts;
    this.base = opts.baseUrl ?? DEFAULT_BASE;
    this.video = new PlateVideo(opts.videoUrl ?? this.base + 'plate.mp4');
    const audioUrl = opts.audioUrl === undefined ? this.base + 'audio.m4a' : opts.audioUrl;
    this.sound = new PlateAudio(opts.audio ?? null, audioUrl);

    this.videoSprite = new Sprite(this.video.texture);
    this.videoSprite.setSize(STAGE_W, STAGE_H);
    this.videoSprite.visible = false;
    this.addChild(this.videoSprite, this.overlay, this.tapDebug);

    // Taps: invisible full-plate hit area, coordinates mapped to stage px.
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, STAGE_W, STAGE_H);
    this.on('pointertap', this.onTap, this);

    const v = this.video.video;
    v.addEventListener('playing', this.onVideoPlaying);
    v.addEventListener('pause', this.onVideoStalled);
    v.addEventListener('waiting', this.onVideoStalled);
    v.addEventListener('seeking', this.onVideoStalled);
    v.addEventListener('ended', this.onVideoEnded);
  }

  /** Current state of the plate state machine. */
  get state(): PlateState {
    return this._state;
  }

  /** Plate time in seconds (video currentTime). Key overlays on this. */
  get time(): number {
    return this.video.time;
  }

  /** Parsed timeline (after load). */
  get holds(): readonly Hold[] {
    return this.timeline.holds;
  }

  /** Load timeline, poster, video first frame, soundtrack and overlays. */
  async load(): Promise<void> {
    const timelineUrl = this.opts.timelineUrl ?? this.base + 'timeline.json';
    const res = await fetch(timelineUrl);
    if (!res.ok) throw new Error(`plate timeline missing: ${timelineUrl} (${res.status})`);
    this.timeline = parseTimeline(await res.json());

    const posterP = Assets.load<Texture>(this.opts.posterUrl ?? this.base + 'poster.jpg')
      .then((tex) => {
        this.poster = new Sprite(tex);
        this.poster.setSize(STAGE_W, STAGE_H);
        this.addChildAt(this.poster, 0);
      })
      .catch(() => undefined);

    await Promise.all([posterP, this.video.load(), this.sound.load(), this.loadOverlays()]);
    this.syncVisuals();
    this._state = 'ready';
    if (this.opts.autoTick !== false) {
      this.ticker = this.opts.ticker ?? Ticker.shared;
      this.ticker.add(this.onTick, this);
    }
  }

  /** Start the take from 0. If autoplay is blocked, the first tap starts it. */
  start(): void {
    if (this._state !== 'ready') return;
    this.nextHold = 0;
    this.tryPlay();
  }

  /**
   * Dev aid (calibration): stop the take and show the frame at `t` seconds with its
   * overlays. Taps are ignored afterwards.
   */
  async debugFreeze(t: number): Promise<void> {
    this._state = 'finished';
    this.video.pause();
    this.sound.stop();
    await this.video.seek(t);
  }

  /** Per-frame step (ms). Called by the ticker unless `autoTick: false`. */
  update(_dtMs: number): void {
    this.video.tick();
    this.syncVisuals();
    const t = this.video.time;

    if (this._state === 'playing') {
      const idx = reachedHold(this.timeline.holds, this.nextHold, t, HOLD_LEAD_S);
      if (idx !== null) this.enterHold(this.timeline.holds[idx]);
      else if (this.timeline.duration !== undefined && t >= this.timeline.duration - 1e-3) this.finish();
      else this.checkDrift(t);
    }
    this.timed?.update(t);
  }

  /** Stop everything and free resources. */
  override destroy(): void {
    this.ticker?.remove(this.onTick, this);
    this.ticker = null;
    const v = this.video.video;
    v.removeEventListener('playing', this.onVideoPlaying);
    v.removeEventListener('pause', this.onVideoStalled);
    v.removeEventListener('waiting', this.onVideoStalled);
    v.removeEventListener('seeking', this.onVideoStalled);
    v.removeEventListener('ended', this.onVideoEnded);
    this.sound.destroy();
    this.video.destroy();
    super.destroy({ children: true });
  }

  // ---------------------------------------------------------------- internals

  private onTick(t: Ticker): void {
    this.update(t.deltaMS);
  }

  private async loadOverlays(): Promise<void> {
    const url = this.opts.patchesUrl ?? this.base + 'patches.json';
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      // Vite's dev server answers unknown paths with index.html (200): not JSON, so skip.
      const items = parseOverlayItems(await res.json());
      if (!items.length) return;
      this.timed = new TimedOverlay(items, this.base, this.opts.makeContent);
      await this.timed.load();
      this.overlay.addChild(this.timed);
    } catch {
      this.timed = null; // no overlays
    }
  }

  private syncVisuals(): void {
    if (this.video.hasFrame && !this.videoSprite.visible) {
      this.videoSprite.visible = true;
      if (this.poster) this.poster.visible = false;
    }
  }

  private tryPlay(): void {
    void this.opts.audio?.resume().catch(() => undefined);
    this.video.play().then(
      () => { if (this._state !== 'finished') this._state = 'playing'; },
      (e) => {
        console.warn('[plate] play() rejected, waiting for a tap:', e);
        this._state = 'blocked';
      },
    );
    // Optimistic: avoids a frame where a hold would be missed while the promise settles.
    if (this._state !== 'finished') this._state = 'playing';
  }

  private enterHold(h: Hold): void {
    this._state = 'holding';
    this.activeHold = h;
    this.video.pause();
    void this.video.seek(h.t);
    this.drawTapArea(h);
    this.onHold(h);
  }

  private onTap(e: FederatedPointerEvent): void {
    // Resume audio inside the gesture on every tap (iOS requirement).
    void this.opts.audio?.resume().catch(() => undefined);
    if (this._state === 'blocked') {
      this.tryPlay();
      return;
    }
    if (this._state !== 'holding' || !this.activeHold) return;
    const p = this.toLocal(e.global);
    if (!hitsTapArea(this.activeHold.tapArea, p.x, p.y)) return;
    const h = this.activeHold;
    this.activeHold = null;
    this.nextHold++;
    this.tapDebug.clear();
    this.onRelease(h);
    this.tryPlay();
  }

  private finish(): void {
    if (this._state === 'finished') return;
    this._state = 'finished';
    this.video.pause();
    this.sound.stop();
    this.tapDebug.clear();
    this.onFinished();
  }

  private checkDrift(t: number): void {
    const bus = this.opts.audio;
    if (!bus || !this.sound.ready || bus.ctx.state !== 'running' || this.video.paused) return;
    if (!this.sound.playing) {
      this.sound.startAt(t);
      return;
    }
    const now = performance.now();
    if (now - this.lastDriftCheck < 500) return;
    this.lastDriftCheck = now;
    if (Math.abs(this.sound.position - t) > (this.opts.maxDriftS ?? 0.08)) this.sound.startAt(t);
  }

  private drawTapArea(h: Hold): void {
    this.tapDebug.clear();
    if (!this.opts.showTapAreas) return;
    const r = h.tapArea === 'anywhere' ? { x: 0, y: 0, w: STAGE_W, h: STAGE_H } : h.tapArea;
    this.tapDebug.rect(r.x, r.y, r.w, r.h).stroke({ width: 6, color: 0x00ff88, alpha: 0.9 });
  }

  private onVideoPlaying = (): void => {
    if (this._state === 'playing' && this.opts.audio?.ctx.state === 'running') this.sound.startAt(this.video.time);
  };

  private onVideoStalled = (): void => {
    this.sound.stop();
  };

  private onVideoEnded = (): void => {
    this.finish();
  };
}
