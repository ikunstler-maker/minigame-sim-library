/**
 * Project preset. All tunable values live here, never in scene code.
 * Persisted to localStorage until IndexedDB lands in Stage 6.
 */

export type WeatherCondition =
  | 'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'night-clear' | 'fog';

/** One slot on the home screen or dock. */
export interface IconSlot {
  /** Catalog id (e.g. 'safari', 'coin-volcano') or 'custom'. */
  iconId: string;
  label: string;
  /** Data URL of an uploaded PNG when iconId === 'custom'. */
  customSrc?: string;
  /** 'game' slots open the game when tapped in Preview. */
  role: 'app' | 'game';
}

export interface StatusBarConfig {
  time: string;
  /** 1..100 */
  battery: number;
  /** Show the number inside the battery. */
  batteryShowPercent: boolean;
  charging: boolean;
  lowPowerMode: boolean;
  /** 0..4 bars */
  signal: number;
  wifi: boolean;
  /** Foreground colour of the status bar: dark text on light wallpaper, or light. */
  style: 'dark' | 'light';
  showDynamicIsland: boolean;
}

export interface HourlyForecast {
  temp: number;
  condition: WeatherCondition;
}

export interface WeatherConfig {
  enabled: boolean;
  /** Top grid row of the 4x2 widget (0..4). */
  row: number;
  city: string;
  showLocationArrow: boolean;
  temp: number;
  condition: WeatherCondition;
  conditionLabel: string;
  high: number;
  low: number;
  highLabel: string;
  lowLabel: string;
  hourFormat: '12h' | '24h';
  /** Six columns, starting at the next hour after the status-bar time. */
  hourly: HourlyForecast[];
  /** Background gradient top → bottom. */
  gradient: [string, string];
}

export interface HomeConfig {
  wallpaper: string;
  /** 4 columns x 6 rows, row-major. null = empty slot. */
  grid: (IconSlot | null)[];
  dock: (IconSlot | null)[];
  showSearchPill: boolean;
  searchLabel: string;
}

/** Notification banner shown at the end of the take. */
export interface PushConfig {
  enabled: boolean;
  /** Catalog icon id (e.g. 'coin-volcano') or 'custom' with customSrc. */
  iconId: string;
  customSrc?: string;
  title: string;
  body: string;
  /** Right-hand time text, e.g. "now". */
  timeLabel: string;
  /** Delay after the game ends, ms. */
  delayMs: number;
  style: 'light' | 'dark';
}

export interface GameConfig {
  /** 'plate' replays the reference take; 'code' (later) is the fully coded version. */
  variant: 'plate' | 'code';
  /** Soundtrack under the plate: the whole original mix, effects only, or none. */
  soundtrack: 'full' | 'sfx' | 'off';
  currency: { thousands: string; decimal: string; decimals: number; prefix: string; suffix: string };
  /** Number overrides keyed "<kind>:<key>[:from|:to]"; missing keys show the reference value. */
  values: Record<string, number>;
  /** Draw the tap areas (spin button) as outlines, for rehearsal. */
  showTapAreas: boolean;
  /** Wait for a tap on Spin and on the BONUS GAME splash (like the real game) instead of continuing by itself. */
  waitForTaps: boolean;
  /**
   * Manual play (default): the player taps Spin, or Auto to let the take run by itself.
   * Off = the take runs by itself from the start. Replaces `waitForTaps` (kept for old presets).
   */
  manualSpin: boolean;
  /** Pause at each of those moments before continuing by itself, ms. */
  autoContinueMs: number;
}

export interface Preset {
  /** Preview background colour behind the stage. */
  background: string;
  /** Play a 1 Hz test beep (Stage 1 check). */
  testTone: boolean;
  /** Start recording automatically when Preview opens. */
  autoRecord: boolean;
  fps: number;
  videoBitrate: number;
  exitTapWindowMs: number;
  exitTapCount: number;
  statusBar: StatusBarConfig;
  weather: WeatherConfig;
  home: HomeConfig;
  /** Duration of the app-open zoom, ms. */
  appOpenMs: number;
  game: GameConfig;
  push: PushConfig;
}

/** Logical stage size: iPhone portrait (19.5:9). */
export const STAGE_W = 1080;
export const STAGE_H = 2340;
/** Points → stage pixels (iPhone 16 Pro width is 402 pt). */
export const PT = STAGE_W / 402;

export const GRID_COLS = 4;
export const GRID_ROWS = 6;

const app = (iconId: string, label: string): IconSlot => ({ iconId, label, role: 'app' });

function defaultGrid(): (IconSlot | null)[] {
  const g: (IconSlot | null)[] = Array(GRID_COLS * GRID_ROWS).fill(null);
  // rows 0-1 hold the weather widget
  const put = (row: number, col: number, s: IconSlot) => (g[row * GRID_COLS + col] = s);
  put(2, 0, app('facetime', 'FaceTime'));
  put(2, 1, app('calendar', 'Calendar'));
  put(2, 2, app('photos', 'Photos'));
  put(2, 3, app('camera', 'Camera'));
  put(3, 0, app('mail', 'Mail'));
  put(3, 1, app('notes', 'Notes'));
  put(3, 2, app('reminders', 'Reminders'));
  put(3, 3, app('clock', 'Clock'));
  put(4, 0, app('app-store', 'App Store'));
  put(4, 1, app('wallet', 'Wallet'));
  put(4, 2, app('settings', 'Settings'));
  put(4, 3, { iconId: 'coin-volcano', label: 'Coin Volcano', role: 'game' });
  return g;
}

export const DEFAULT_PRESET: Preset = {
  background: '#000000',
  testTone: false,
  autoRecord: true,
  fps: 60,
  videoBitrate: 12_000_000,
  exitTapWindowMs: 800,
  exitTapCount: 3,
  appOpenMs: 450,
  push: {
    enabled: true,
    iconId: 'coin-volcano',
    title: 'Coin Volcano',
    body: 'Your win is waiting! Tap to collect it.',
    timeLabel: 'now',
    delayMs: 900,
    style: 'light',
  },
  game: {
    variant: 'code',
    soundtrack: 'full',
    currency: { thousands: ',', decimal: '.', decimals: 2, prefix: '', suffix: '' },
    values: {},
    showTapAreas: false,
    waitForTaps: false,
    manualSpin: true,
    autoContinueMs: 700,
  },
  statusBar: {
    time: '10:37',
    battery: 42,
    batteryShowPercent: false,
    charging: false,
    lowPowerMode: false,
    signal: 4,
    wifi: true,
    style: 'dark',
    showDynamicIsland: true,
  },
  weather: {
    enabled: true,
    row: 0,
    city: 'Toronto',
    showLocationArrow: true,
    temp: 4,
    condition: 'cloudy',
    conditionLabel: 'Mostly Cloudy',
    high: 6,
    low: 1,
    highLabel: 'H',
    lowLabel: 'L',
    hourFormat: '12h',
    hourly: [
      { temp: 4, condition: 'cloudy' },
      { temp: 5, condition: 'cloudy' },
      { temp: 5, condition: 'partly-cloudy' },
      { temp: 6, condition: 'partly-cloudy' },
      { temp: 5, condition: 'cloudy' },
      { temp: 4, condition: 'cloudy' },
    ],
    gradient: ['#41597d', '#8d9fb9'],
  },
  home: {
    wallpaper: './ios/wallpaper.webp',
    grid: defaultGrid(),
    dock: [app('phone', 'Phone'), app('safari', 'Safari'), app('messages', 'Messages'), app('music', 'Music')],
    showSearchPill: true,
    searchLabel: 'Search',
  },
};

const KEY = 'sim-studio.preset.v2';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge saved values over defaults; arrays are taken whole from the saved side. */
function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge((base as Record<string, unknown>)[k], v);
  return out as T;
}

/** Load the saved preset, filling missing keys from defaults. */
export function loadPreset(): Preset {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? merge(structuredClone(DEFAULT_PRESET), JSON.parse(raw)) : structuredClone(DEFAULT_PRESET);
  } catch {
    return structuredClone(DEFAULT_PRESET);
  }
}

/** Save the preset to localStorage. Returns false when storage is full. */
export function savePreset(p: Preset): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** Reset to defaults and clear storage. */
export function resetPreset(): Preset {
  localStorage.removeItem(KEY);
  return structuredClone(DEFAULT_PRESET);
}
