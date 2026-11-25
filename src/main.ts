import './style.css';
import { STAGE_H, STAGE_W, loadPreset, resetPreset, savePreset, type Preset, type WeatherCondition } from './config';
import { AudioBus } from './audio/AudioBus';
import { CanvasRecorder, pickMimeType, type Recording } from './recorder/CanvasRecorder';
import { StageApp } from './stage/StageApp';
import { HomeEditor } from './studio/HomeEditor';
import { loadCatalog } from './ios/iconCatalog';
import { itemText, valueKey, type PatchText } from './games/coin-volcano-plate/numbersLayer';

const studioEl = document.getElementById('studio')!;
const previewEl = document.getElementById('preview')!;
const wrapEl = document.getElementById('stage-wrap')!;
const hotspotEl = document.getElementById('exit-hotspot')!;
const exportEl = document.getElementById('export')!;

let preset: Preset = loadPreset();
let stage: StageApp | null = null;
let audio: AudioBus | null = null;
let recorder: CanvasRecorder | null = null;
let lastRecording: Recording | null = null;
let lastUrl = '';

type Mode = 'studio' | 'preview' | 'export';
function show(mode: Mode): void {
  studioEl.hidden = mode !== 'studio';
  previewEl.hidden = mode !== 'preview';
  exportEl.hidden = mode !== 'export';
}

function commit(p: Preset): void {
  preset = p;
  if (!savePreset(p)) alert('Storage is full: the last change was not saved. Use smaller images.');
}

// ---------- Studio form helpers ----------
const CONDITIONS: WeatherCondition[] = ['sunny', 'partly-cloudy', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'night-clear'];

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>;
  parent[last] = value;
}
const attr = (v: unknown) => String(v ?? '').replace(/"/g, '&quot;');

function text(path: string, label: string): string {
  return `<label>${label} <input data-path="${path}" value="${attr(getPath(preset, path))}"></label>`;
}
function num(path: string, label: string, min?: number, max?: number): string {
  return `<label>${label} <input data-path="${path}" data-type="number" type="number" inputmode="decimal" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} value="${attr(getPath(preset, path))}"></label>`;
}
function check(path: string, label: string): string {
  return `<label class="chk"><input data-path="${path}" data-type="bool" type="checkbox" ${getPath(preset, path) ? 'checked' : ''}> ${label}</label>`;
}
function color(path: string, label: string): string {
  return `<label>${label} <input data-path="${path}" type="color" value="${attr(getPath(preset, path))}"></label>`;
}
function select(path: string, label: string, options: (string | number)[], numeric = false): string {
  const cur = String(getPath(preset, path));
  const opts = options.map((o) => `<option ${String(o) === cur ? 'selected' : ''}>${o}</option>`).join('');
  return `<label>${label} <select data-path="${path}" ${numeric ? 'data-type="number"' : ''}>${opts}</select></label>`;
}

// ---------- Studio ----------
let homeEditor: HomeEditor | null = null;

async function renderStudio(): Promise<void> {
  const mime = pickMimeType() || 'not supported';
  const hourly = preset.weather.hourly
    .map((_, i) => `<div class="hour">${num(`weather.hourly.${i}.temp`, `#${i + 1}`)}${select(`weather.hourly.${i}.condition`, '', CONDITIONS)}</div>`)
    .join('');
  studioEl.innerHTML = `
    <h1>Sim Studio <small>Stage 2</small></h1>
    <button id="b-preview" class="primary">▶ Preview</button>
    <p class="note">Record format here: <b>${mime}</b>. To finish a take, tap the clock ${preset.exitTapCount}× quickly.</p>

    <details open><summary>Home screen</summary><div id="home-editor"></div></details>

    <details><summary>Game — Coin Volcano</summary><section>
      ${select('game.variant', 'Version', ['plate', 'code'])}
      <p class="note">plate = the reference take replayed with your numbers · code = fully coded version (coming later, for comparison)</p>
      ${select('game.soundtrack', 'Sound', ['full', 'sfx', 'off'])}
      ${text('game.currency.prefix', 'Currency before')}
      ${text('game.currency.suffix', 'Currency after')}
      ${text('game.currency.thousands', 'Thousands separator')}
      ${text('game.currency.decimal', 'Decimal separator')}
      ${select('game.currency.decimals', 'Decimals', [0, 1, 2], true)}
      ${check('game.waitForTaps', 'Wait for my tap on Spin and on BONUS GAME')}
      ${num('game.autoContinueMs', 'Otherwise continue after (ms)', 0, 5000)}
      ${check('game.showTapAreas', 'Show tap areas (rehearsal)')}
      <p class="note">Numbers (empty = value from the reference video):</p>
      <div id="game-values" class="values"><p class="note">Loading…</p></div>
    </section></details>

    <details><summary>Status bar</summary><section>
      ${text('statusBar.time', 'Time')}
      ${num('statusBar.battery', 'Battery %', 1, 100)}
      ${check('statusBar.batteryShowPercent', 'Show % inside battery')}
      ${check('statusBar.charging', 'Charging')}
      ${check('statusBar.lowPowerMode', 'Low Power Mode')}
      ${select('statusBar.signal', 'Signal bars', [0, 1, 2, 3, 4], true)}
      ${check('statusBar.wifi', 'Wi-Fi')}
      ${select('statusBar.style', 'Text colour', ['dark', 'light'])}
      ${check('statusBar.showDynamicIsland', 'Dynamic Island')}
    </section></details>

    <details><summary>Weather widget</summary><section>
      ${check('weather.enabled', 'Show widget')}
      ${select('weather.row', 'Widget row', [0, 1, 2, 3, 4], true)}
      ${text('weather.city', 'City')}
      ${check('weather.showLocationArrow', 'Location arrow')}
      ${num('weather.temp', 'Temperature')}
      ${select('weather.condition', 'Condition icon', CONDITIONS)}
      ${text('weather.conditionLabel', 'Condition text')}
      ${num('weather.high', 'High')}
      ${num('weather.low', 'Low')}
      ${text('weather.highLabel', 'High label')}
      ${text('weather.lowLabel', 'Low label')}
      ${select('weather.hourFormat', 'Hours', ['12h', '24h'])}
      ${color('weather.gradient.0', 'Gradient top')}
      ${color('weather.gradient.1', 'Gradient bottom')}
      <p class="note">Hourly forecast (starts at the hour after the status-bar time):</p>
      ${hourly}
      <p class="note">Live weather for the current day is planned for a later stage.</p>
    </section></details>

    <details><summary>Recording</summary><section>
      ${check('autoRecord', 'Record automatically')}
      ${select('fps', 'FPS', [30, 60], true)}
      ${check('testTone', 'Stage 1 test scene (beep)')}
    </section></details>

    <div class="row"><button id="b-reset">Reset all settings</button></div>
  `;

  studioEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path]').forEach((el) => {
    el.addEventListener('change', () => {
      const p = structuredClone(preset);
      const type = el.dataset.type;
      const v = type === 'bool' ? (el as HTMLInputElement).checked : type === 'number' ? Number(el.value) : el.value;
      setPath(p, el.dataset.path!, v);
      commit(p);
      homeEditor?.render();
    });
  });
  document.getElementById('b-preview')!.addEventListener('click', () => void startPreview());
  document.getElementById('b-reset')!.addEventListener('click', () => {
    if (!confirm('Reset every setting to the defaults?')) return;
    preset = resetPreset();
    void renderStudio();
  });
  homeEditor = new HomeEditor(document.getElementById('home-editor')!, () => preset, commit, await loadCatalog());
  void renderGameValues();
}

/** One editable field per number found in the plate's patches.json. */
async function renderGameValues(): Promise<void> {
  const box = document.getElementById('game-values');
  if (!box) return;
  let items: { id?: string; text?: PatchText }[] = [];
  try {
    const json = await fetch('./private/coin-volcano/plate/patches.json').then((r) => r.json());
    items = Array.isArray(json) ? json : json.items ?? [];
  } catch {
    box.innerHTML = '<p class="note">Game files are not on this build (private art). Numbers can be set on a local build.</p>';
    return;
  }
  const rows = new Map<string, { label: string; ref: string }>();
  for (const it of items) {
    const t = itemText(it);
    if (!t) continue;
    if (t.countUp) {
      rows.set(valueKey(t, 'from'), { label: `${t.kind} ${t.key} — from`, ref: t.countUp.from });
      rows.set(valueKey(t, 'to'), { label: `${t.kind} ${t.key} — to`, ref: t.countUp.to });
    } else {
      rows.set(valueKey(t), { label: `${t.kind} ${t.key}`, ref: t.ref });
    }
  }
  box.innerHTML = [...rows.entries()]
    .map(([k, r]) => {
      const v = preset.game.values[k];
      return `<label>${r.label} <input data-value-key="${attr(k)}" type="number" inputmode="decimal" step="0.01" placeholder="${attr(r.ref)}" value="${v ?? ''}"></label>`;
    })
    .join('');
  box.querySelectorAll<HTMLInputElement>('[data-value-key]').forEach((el) =>
    el.addEventListener('change', () => {
      const p = structuredClone(preset);
      const k = el.dataset.valueKey!;
      if (el.value === '') delete p.game.values[k];
      else p.game.values[k] = Number(el.value);
      commit(p);
    }),
  );
}

// ---------- Preview ----------
async function startPreview(): Promise<void> {
  show('preview');
  // AudioContext must be created/resumed inside the tap that opened Preview (iOS).
  audio ??= new AudioBus();
  await audio.resume();

  stage = new StageApp(preset, audio);
  const canvas = await stage.init();
  wrapEl.prepend(canvas);
  fitStage();

  if (preset.autoRecord) {
    recorder = new CanvasRecorder(canvas, audio.recordStream);
    try {
      recorder.start(preset.fps, preset.videoBitrate);
    } catch (e) {
      alert((e as Error).message);
      recorder = null;
    }
  }
}

async function stopPreview(): Promise<void> {
  const rec = recorder ? await recorder.stop() : null;
  recorder = null;
  stage?.destroy();
  stage = null;
  if (rec) {
    lastRecording = rec;
    renderExport();
  } else {
    void renderStudio();
    show('studio');
  }
}

/** Fit the stage inside the viewport (letterboxed when aspect differs). */
function fitStage(): void {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  wrapEl.style.width = `${STAGE_W * scale}px`;
  wrapEl.style.height = `${STAGE_H * scale}px`;
}
window.addEventListener('resize', fitStage);

// Secret exit: N quick taps on the clock area. DOM overlay → never recorded.
let taps: number[] = [];
hotspotEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < preset.exitTapWindowMs), now];
  if (taps.length >= preset.exitTapCount) {
    taps = [];
    void stopPreview();
  }
});

// ---------- Export ----------
function renderExport(): void {
  const rec = lastRecording!;
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(rec.blob);
  const name = `take-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${rec.extension}`;
  const mb = (rec.blob.size / 1_048_576).toFixed(1);
  exportEl.innerHTML = `
    <video src="${lastUrl}" controls playsinline></video>
    <p class="note">${(rec.durationMs / 1000).toFixed(1)} s · ${mb} MB · ${rec.mimeType}</p>
    <div class="row">
      <button id="b-share" class="primary">Save / Share</button>
      <a id="b-dl" class="btn" href="${lastUrl}" download="${name}">Download</a>
    </div>
    <div class="row">
      <button id="b-again">Record again</button>
      <button id="b-back">Back to Studio</button>
    </div>
  `;
  show('export');
  document.getElementById('b-share')!.addEventListener('click', async () => {
    const file = new File([rec.blob], name, { type: rec.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        /* user cancelled */
      }
    } else {
      (document.getElementById('b-dl') as HTMLAnchorElement).click();
    }
  });
  document.getElementById('b-again')!.addEventListener('click', () => void startPreview());
  document.getElementById('b-back')!.addEventListener('click', () => {
    void renderStudio();
    show('studio');
  });
}

void renderStudio();
show('studio');

// Dev/calibration: ?game opens the game directly; ?game&t=12.5 freezes on that frame.
const qs = new URLSearchParams(location.search);
if (qs.has('game')) {
  const t = qs.get('t');
  void startPreview().then(() => stage?.openGameDirect(t === null ? undefined : Number(t)));
}
