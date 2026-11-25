/**
 * Project preset (Stage 1 subset). All tunable values live here, never in scene code.
 * Persisted to localStorage until IndexedDB lands in Stage 6.
 */
export interface Preset {
  /** Status-bar clock text shown in the preview. */
  clock: string;
  /** Preview background colour (hex). */
  background: string;
  /** Play a 1 Hz test beep that must appear in the recorded audio track. */
  testTone: boolean;
  /** Start recording automatically when Preview opens. */
  autoRecord: boolean;
  /** Frames per second requested from canvas.captureStream. */
  fps: number;
  /** Video bitrate in bits per second. */
  videoBitrate: number;
  /** Max delay between taps of the secret exit gesture, ms. */
  exitTapWindowMs: number;
  /** Number of taps on the clock that ends the take. */
  exitTapCount: number;
}

/** Logical stage size: 9:16 portrait. */
export const STAGE_W = 1080;
export const STAGE_H = 1920;

export const DEFAULT_PRESET: Preset = {
  clock: '9:41',
  background: '#2a0b4a',
  testTone: true,
  autoRecord: true,
  fps: 60,
  videoBitrate: 12_000_000,
  exitTapWindowMs: 800,
  exitTapCount: 3,
};

const KEY = 'sim-studio.preset.v1';

/** Load the saved preset, filling missing keys from defaults. */
export function loadPreset(): Preset {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PRESET, ...JSON.parse(raw) } : { ...DEFAULT_PRESET };
  } catch {
    return { ...DEFAULT_PRESET };
  }
}

/** Save the preset to localStorage. */
export function savePreset(p: Preset): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
