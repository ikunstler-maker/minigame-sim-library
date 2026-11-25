/**
 * Records a canvas plus a Web Audio bus into one video file with MediaRecorder.
 * Prefers mp4 (iOS Safari), falls back to webm (Chrome/Android).
 */
export interface Recording {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  durationMs: number;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** Pick the first container the browser can record, or '' if none. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  /**
   * @param canvas  the canvas whose frames are recorded
   * @param audioStream  stream from AudioContext.createMediaStreamDestination()
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audioStream: MediaStream | null,
  ) {}

  get isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** Start recording. Throws if the browser cannot record a canvas. */
  start(fps: number, videoBitsPerSecond: number): void {
    const mimeType = pickMimeType();
    if (!mimeType || !('captureStream' in this.canvas)) {
      throw new Error('This browser cannot record the canvas (no MediaRecorder / captureStream).');
    }
    const video = this.canvas.captureStream(fps);
    const tracks = [...video.getVideoTracks(), ...(this.audioStream?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.startedAt = performance.now();
  }

  /** Stop and return the finished file. */
  stop(): Promise<Recording | null> {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || pickMimeType();
        const blob = new Blob(this.chunks, { type: mimeType.split(';')[0] });
        resolve({
          blob,
          mimeType,
          extension: mimeType.includes('mp4') ? 'mp4' : 'webm',
          durationMs: performance.now() - this.startedAt,
        });
      };
      rec.stop();
    });
  }
}
