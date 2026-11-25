/**
 * One AudioContext for the whole preview. Everything plays through `master`,
 * which feeds both the speakers and a MediaStream for the recorder.
 */
export class AudioBus {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly recordStream: MediaStream;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.ctx.destination);
    this.master.connect(dest);
    this.recordStream = dest.stream;
  }

  /** Must be called from a user gesture on iOS. */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Short synthesized beep, used as the Stage 1 test sound. */
  beep(freq = 880, durationS = 0.12, volume = 0.25): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + durationS + 0.02);
  }
}
