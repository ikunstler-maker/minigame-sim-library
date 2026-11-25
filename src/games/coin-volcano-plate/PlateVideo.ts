import { Texture, VideoSource } from 'pixi.js';

/** `requestVideoFrameCallback` is not in every TS DOM lib; typed locally. */
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

/**
 * An HTMLVideoElement wrapped as a PixiJS texture whose GPU upload we drive
 * ourselves (PixiJS 8.23 `VideoSource`, `autoUpdate = false`).
 *
 * Why manual: VideoSource's own auto-update relies on `requestVideoFrameCallback`
 * when present, and some iOS Safari builds do not fire it for a video that is
 * not composited on the page. Here `tick()` uploads whenever a new frame was
 * presented (rVFC, when it fires) OR `currentTime` moved (fallback), and once
 * after every seek. Call `tick()` once per rendered frame.
 */
export class PlateVideo {
  /** The element. Muted + playsInline so muted autoplay is allowed on iOS. */
  readonly video: RvfcVideo;
  readonly source: VideoSource;
  readonly texture: Texture;
  /** True once a real video frame has been uploaded to the texture. */
  hasFrame = false;

  private dirty = true;
  private lastUploadT = -1;
  private rvfcHandle: number | null = null;
  private lastRvfcMs = 0;

  constructor(url: string) {
    const v = document.createElement('video') as RvfcVideo;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('muted', '');
    v.preload = 'auto';
    v.loop = false;
    v.src = url;
    // Kept in the DOM (1 px, nearly transparent): iOS may not decode frames of a
    // detached video element. Not display:none for the same reason.
    Object.assign(v.style, {
      position: 'fixed', left: '0', top: '0', width: '1px', height: '1px',
      opacity: '0.01', pointerEvents: 'none', zIndex: '-1',
    });
    document.body.appendChild(v);
    this.video = v;

    this.source = new VideoSource({ resource: v, autoPlay: false, autoLoad: false, label: 'plate-video' });
    this.source.autoUpdate = false;
    this.texture = new Texture({ source: this.source });

    v.addEventListener('seeked', this.markDirty);
    v.addEventListener('loadeddata', this.markDirty);
    v.addEventListener('play', this.armRvfc);
  }

  /**
   * Resolve when the first frame is decoded and on the texture.
   * iOS does not always decode a frame before playback, so if needed this plays
   * muted for a moment and seeks back to 0 (muted autoplay is allowed). If even
   * that is blocked (Low Power Mode), it resolves after `timeoutMs` and the
   * caller keeps showing the poster until the first tap starts playback.
   */
  async load(timeoutMs = 8000): Promise<void> {
    await this.source.load().catch(() => undefined);
    const v = this.video;
    const haveData = () => v.readyState >= 2;
    if (!haveData()) {
      await new Promise<void>((res) => {
        const done = () => { clearTimeout(to); v.removeEventListener('loadeddata', done); res(); };
        const to = setTimeout(done, timeoutMs);
        v.addEventListener('loadeddata', done);
        v.load();
      });
    }
    if (!haveData()) {
      try {
        await v.play();
        v.pause();
      } catch { /* blocked: poster stays until a tap */ }
    }
    if (v.readyState >= 1 && v.currentTime !== 0) await this.seek(0);
    this.markDirty();
    this.tick();
  }

  /** Current plate time in seconds. */
  get time(): number {
    return this.video.currentTime;
  }

  get paused(): boolean {
    return this.video.paused;
  }

  /** Start/resume. Rejects when the browser blocks playback (retry from a tap). */
  play(): Promise<void> {
    return this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  /** Seek and resolve after `seeked` (the frame is then uploaded by `tick`). */
  seek(t: number): Promise<void> {
    const v = this.video;
    return new Promise((res) => {
      if (Math.abs(v.currentTime - t) < 1e-4) { res(); return; }
      const done = () => { v.removeEventListener('seeked', done); res(); };
      v.addEventListener('seeked', done);
      v.currentTime = t;
    });
  }

  /** Upload the current video frame to the GPU when it changed. Call every frame. */
  tick(): void {
    const v = this.video;
    if (v.readyState < 2 || !this.source.isValid) return;
    if (!this.source.isReady) {
      this.source.isReady = true;
      this.source.resize(v.videoWidth, v.videoHeight);
    }
    const playing = !v.paused && !v.ended;
    // While rVFC is alive it is the frame clock; otherwise watch currentTime.
    const rvfcAlive = this.rvfcHandle !== null && performance.now() - this.lastRvfcMs < 250;
    if (playing && !rvfcAlive && v.currentTime !== this.lastUploadT) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastUploadT = v.currentTime;
    this.source.update();
    this.hasFrame = true;
  }

  /** Remove the element and free the texture. */
  destroy(): void {
    const v = this.video;
    if (this.rvfcHandle !== null) v.cancelVideoFrameCallback?.(this.rvfcHandle);
    this.rvfcHandle = null;
    v.removeEventListener('seeked', this.markDirty);
    v.removeEventListener('loadeddata', this.markDirty);
    v.removeEventListener('play', this.armRvfc);
    this.texture.destroy(true); // destroys the VideoSource too (pauses, clears src)
    v.remove();
  }

  private markDirty = (): void => {
    this.dirty = true;
  };

  private armRvfc = (): void => {
    const v = this.video;
    if (!v.requestVideoFrameCallback || this.rvfcHandle !== null) return;
    const onFrame = () => {
      this.lastRvfcMs = performance.now();
      this.dirty = true;
      this.rvfcHandle = v.paused || v.ended ? null : v.requestVideoFrameCallback!(onFrame);
    };
    this.rvfcHandle = v.requestVideoFrameCallback(onFrame);
  };
}
