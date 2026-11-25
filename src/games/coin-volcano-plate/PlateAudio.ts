import type { AudioBus } from '../../audio/AudioBus';

/**
 * The plate soundtrack, decoded into an AudioBuffer and played through the
 * AudioBus (so it reaches both the speakers and the recorder).
 *
 * The video is the master clock: `startAt(t)` begins the buffer at plate time
 * `t`; `stop()` silences it. The plate calls these on every play/pause/seek and
 * re-syncs when drift exceeds a threshold.
 */
export class PlateAudio {
  private buffer: AudioBuffer | null = null;
  private node: AudioBufferSourceNode | null = null;
  /** ctx.currentTime minus plate time at the moment the node started. */
  private offset = 0;

  constructor(private readonly bus: AudioBus | null, private readonly url: string | null) {}

  /** Fetch and decode. A missing file or no bus leaves the plate silent (never rejects). */
  async load(): Promise<void> {
    if (!this.bus || !this.url) return;
    try {
      const res = await fetch(this.url);
      if (!res.ok) return;
      const data = await res.arrayBuffer();
      this.buffer = await this.bus.ctx.decodeAudioData(data);
    } catch (e) {
      console.warn('[plate] soundtrack unavailable, running silent:', e);
      this.buffer = null;
    }
  }

  /** True when a decoded soundtrack exists. */
  get ready(): boolean {
    return !!this.buffer;
  }

  /** True while a source node is running. */
  get playing(): boolean {
    return !!this.node;
  }

  /** Start (or restart) playback at plate time `t` seconds. */
  startAt(t: number): void {
    if (!this.bus || !this.buffer) return;
    this.stop();
    if (t >= this.buffer.duration) return;
    const ctx = this.bus.ctx;
    const node = ctx.createBufferSource();
    node.buffer = this.buffer;
    node.connect(this.bus.master);
    node.start(0, Math.max(0, t));
    node.onended = () => { if (this.node === node) this.node = null; };
    this.node = node;
    this.offset = ctx.currentTime - t;
  }

  /** Where the soundtrack is now, in plate seconds (NaN when not playing). */
  get position(): number {
    return this.node && this.bus ? this.bus.ctx.currentTime - this.offset : NaN;
  }

  stop(): void {
    const n = this.node;
    this.node = null;
    if (!n) return;
    n.onended = null;
    try { n.stop(); } catch { /* already stopped */ }
    n.disconnect();
  }

  destroy(): void {
    this.stop();
    this.buffer = null;
  }
}
