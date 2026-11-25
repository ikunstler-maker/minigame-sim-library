import './style.css';
import { STAGE_H, STAGE_W, loadPreset, resetPreset, savePreset, type PageBlockKind, type Preset, type WeatherCondition } from './config';
import { AudioBus } from './audio/AudioBus';
import { CanvasRecorder, pickMimeType, type Recording } from './recorder/CanvasRecorder';
import { StageApp } from './stage/StageApp';
import { HomeEditor } from './studio/HomeEditor';
import { loadCatalog } from './ios/iconCatalog';
import { itemText, valueKey, type PatchText } from './games/coin-volcano-plate/numbersLayer';
import { editableValues } from './games/coin-volcano-code/values';
import { fileToIcon, fileToWallpaper, pickFile, pickImage } from './studio/images';
import { CURRENCIES, LOCALES, formatCurrency, separatorsFor } from './money';
import { FONT_CHOICES, fileToFont } from './fonts';
import { LivePreview, type LiveScene, type Pick } from './studio/LivePreview';

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

function commit(p: Preset, hint?: string): void {
  preset = p;
  if (!savePreset(p)) alert('Storage is full: the last change was not saved. Use smaller images.');
  void live?.update(p, hint);
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
  const settingsHtml = `
    <h1>Sim Studio <small>Coin Volcano</small></h1>
    <button id="b-preview" class="primary">▶ Preview</button>
    <p class="note">Record format here: <b>${mime}</b>. To finish a take, tap the clock ${preset.exitTapCount}× quickly.</p>

    <details id="sec-home" open><summary>Home screen</summary><div id="home-editor"></div></details>

    <details id="sec-game"><summary>Game — Coin Volcano</summary><section>
      ${select('game.variant', 'Version', ['plate', 'code'])}
      <p class="note">plate = reference video with your numbers on top · code = every symbol and number drawn as our own element</p>
      ${select('game.soundtrack', 'Sound', ['full', 'sfx', 'off'])}
      ${text('game.currency.prefix', 'Currency before')}
      ${text('game.currency.suffix', 'Currency after')}
      ${text('game.currency.thousands', 'Thousands separator')}
      ${text('game.currency.decimal', 'Decimal separator')}
      ${select('game.currency.decimals', 'Decimals', [0, 1, 2], true)}
      ${check('game.manualSpin', 'Manual play: I tap Spin myself (or Auto in the game)')}
      ${num('game.autoContinueMs', 'Auto: pause at Spin / BONUS GAME (ms)', 0, 5000)}
      ${check('game.showTapAreas', 'Show tap areas (rehearsal)')}
      <p class="note">Numbers (empty = value from the reference video):</p>
      <div id="game-values" class="values"><p class="note">Loading…</p></div>
    </section></details>

    <details id="sec-push"><summary>Notification (end of the take)</summary><section>
      ${check('push.enabled', 'Show a notification after the big win')}
      <div class="push-icon"><img id="push-icon-img" alt=""><select id="push-icon-sel"></select><button id="push-icon-up">Upload…</button></div>
      ${text('push.title', 'Title')}
      <label>Text <textarea data-path="push.body" rows="3">${attr(preset.push.body)}</textarea></label>
      ${num('push.startBalance', 'Wallet balance before the win', 0)}
      <p class="note">Auto-filled: <b>{win}</b> big win from the game settings · <b>{balance}</b> = balance before + win · <b>{start}</b> balance before · <b>{id}</b> new random 4 digits in every take · <b>{currency}</b> sign. Amounts follow Region &amp; currency.</p>
      ${text('push.timeLabel', 'Time label')}
      ${num('push.delayMs', 'Delay after the win (ms)', 0, 10000)}
      ${select('push.style', 'Style', ['light', 'dark'])}
    </section></details>

    <details id="sec-region"><summary>Region &amp; currency</summary><section>
      <label>Country format <select id="region-locale">${LOCALES.map((l) => `<option value="${l.id}" ${l.id === preset.region.locale ? 'selected' : ''}>${l.label}</option>`).join('')}</select></label>
      <label>Currency <select id="region-currency">${CURRENCIES.map((c) => `<option ${c === preset.region.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <p class="note">Example: <b id="region-example"></b>. Game numbers use the same separators.</p>
    </section></details>

    <details id="sec-page"><summary>Page after tapping the notification</summary><section>
      ${check('page.enabled', 'Open the page when the notification is tapped')}
      ${color('page.background', 'Background colour')}
      <div class="row"><button id="page-bg-up">Background image…</button><button id="page-bg-clear">No image</button></div>
      ${pairSelect('page.backgroundFit', 'Background image placement', FIT_OPTIONS.filter(([v]) => v !== 'free'), preset.page.backgroundFit ?? 'cover')}
      ${select('page.amountAnim', 'Amount change', ['counter', 'spinner', 'pull'])}
      <p class="note">counter = counts up · spinner = loader, then the new number · pull = pull-to-refresh, then the new number</p>
      <p class="note">Drag the amount on the phone (Page tab) to move it; set its size in "Size pt".</p>
      ${num('page.amountDelayMs', 'Start after (ms)', 0, 10000)}
      ${num('page.amountDurationMs', 'Duration (ms)', 100, 10000)}
      <div id="page-blocks">${pageBlocksHtml()}</div>
      <div class="row"><button data-add="text">+ Text</button><button data-add="amount">+ Amount</button><button data-add="image">+ Image</button></div>
    </section></details>

    <details id="sec-status"><summary>Status bar</summary><section>
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

    <details id="sec-weather"><summary>Weather widget</summary><section>
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

    <details id="sec-rec"><summary>Recording</summary><section>
      ${check('autoRecord', 'Record automatically')}
      ${select('fps', 'FPS', [30, 60], true)}
      ${check('testTone', 'Stage 1 test scene (beep)')}
    </section></details>

    <div class="row"><button id="b-reset">Reset all settings</button></div>
  `;
  studioEl.innerHTML = `
    <div class="studio-grid">
      <div class="settings">${settingsHtml}</div>
      <aside class="live">
        <div class="live-tabs">
          <button data-scene="home">Home screen</button>
          <button data-scene="game">Game</button>
          <button data-scene="push">Notification</button>
          <button data-scene="page">Page</button>
        </div>
        <div class="live-time" hidden>
          <input id="live-t" type="range" min="0" max="38.6" step="0.1" value="${liveTime}">
          <span id="live-t-label">${liveTime.toFixed(1)} s</span>
        </div>
        <div id="live-host"></div>
        <p id="live-status" class="note"></p>
        <p class="note">Tap any element on the phone to edit it. The changed element is outlined.</p>
      </aside>
    </div>
  `;

  void bindPushIcon();
  bindRegionAndPage();
  studioEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-path]').forEach((el) => {
    el.addEventListener('change', () => {
      const p = structuredClone(preset);
      const type = el.dataset.type;
      const v = type === 'bool' ? (el as HTMLInputElement).checked : type === 'number' ? Number(el.value) : el.value;
      setPath(p, el.dataset.path!, v);
      commit(p, el.dataset.path);
      homeEditor?.render();
      if (el.dataset.path === 'game.variant') void renderGameValues();
    });
  });
  document.getElementById('b-preview')!.addEventListener('click', () => void startPreview());
  document.getElementById('b-reset')!.addEventListener('click', () => {
    if (!confirm('Reset every setting to the defaults?')) return;
    preset = resetPreset();
    void renderStudio();
  });
  homeEditor = new HomeEditor(document.getElementById('home-editor')!, () => preset, (p) => commit(p, 'home'), await loadCatalog());
  gameValuesReady = renderGameValues();
  await mountLive();
}

// ---------- Live phone mock ----------
let live: LivePreview | null = null;
let liveScene: LiveScene = 'home';
let liveTime = 14;
let gameValuesReady: Promise<void> = Promise.resolve();

async function mountLive(): Promise<void> {
  const host = document.getElementById('live-host')!;
  const status = document.getElementById('live-status')!;
  if (!live) {
    live = new LivePreview();
    await live.init(host);
    live.onPick = (pk) => void focusPick(pk);
    live.onMoveBlock = (i, x, y) => {
      const p = structuredClone(preset);
      p.page.blocks[i].x = x;
      p.page.blocks[i].y = y;
      commit(p, `page.blocks.${i}.text`);
      // keep the X / Y fields in the settings in step
      for (const [k, v] of [['x', x], ['y', y]] as const) {
        const el = document.querySelector<HTMLInputElement>(`[data-path="page.blocks.${i}.${k}"]`);
        if (el) el.value = String(v);
      }
    };
  } else {
    live.attach(host);
  }
  live.onStatus = (s) => (status.textContent = s);
  const timeRow = document.querySelector<HTMLElement>('.live-time')!;
  const slider = document.getElementById('live-t') as HTMLInputElement;
  const label = document.getElementById('live-t-label')!;
  const tabs = document.querySelectorAll<HTMLButtonElement>('.live-tabs button');
  const setScene = (sc: LiveScene) => {
    liveScene = sc;
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.scene === sc));
    timeRow.hidden = sc !== 'game';
    void live!.setScene(sc);
  };
  tabs.forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene as LiveScene)));
  let pending = false;
  slider.addEventListener('input', () => {
    liveTime = Number(slider.value);
    label.textContent = `${liveTime.toFixed(1)} s`;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      void live!.setTime(liveTime);
    });
  });
  await live.update(preset);
  await live.setTime(liveTime);
  setScene(liveScene);
}

/** Open the settings of the element tapped on the phone, focus and highlight its field. */
async function focusPick(pk: Pick): Promise<void> {
  const sec = document.getElementById(pk.section) as HTMLDetailsElement | null;
  if (!sec) return;
  sec.open = true;
  if (pk.slot) {
    homeEditor?.openSheet(pk.slot);
    return;
  }
  if (pk.section === 'sec-game') await gameValuesReady;
  const field = pk.field
    ? sec.querySelector<HTMLElement>(`[data-value-key="${CSS.escape(pk.field)}"], [data-path="${CSS.escape(pk.field)}"]`)
    : null;
  const block = pk.field?.match(/^page\.blocks\.(\d+)\./);
  const target = block ? (document.getElementById(`block-${block[1]}`) ?? sec) : ((field?.closest('label') as HTMLElement | null) ?? sec);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('pulse');
  void target.offsetWidth;
  target.classList.add('pulse');
  if (field instanceof HTMLInputElement) setTimeout(() => field.focus({ preventScroll: true }), 350);
}

const FIT_OPTIONS: [string, string][] = [['cover', 'Fill the screen (crop)'], ['width', 'Fit 100% width'], ['height', 'Fit 100% height'], ['stretch', 'Stretch to the screen'], ['free', 'Free (X / Y / width)']];

/** <select> with value/label pairs, bound by data-path. */
function pairSelect(path: string, label: string, options: [string, string][], cur: string): string {
  const opts = options.map(([v, l]) => `<option value="${attr(v)}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  return `<label>${label} <select data-path="${path}">${opts}</select></label>`;
}

function fontOptions(): [string, string][] {
  return [...FONT_CHOICES.map((f) => [f.id, f.label] as [string, string]), ...preset.customFonts.map((f) => [`custom:${f.name}`, `${f.name} (uploaded)`] as [string, string])];
}

/** Editor rows for the page blocks (data-path bound like every other field). */
function pageBlocksHtml(): string {
  return preset.page.blocks
    .map((b, i) => {
      const P = `page.blocks.${i}`;
      const isImg = b.kind === 'image';
      const content = isImg
        ? `<button data-block-img="${i}">${b.imageSrc ? 'Change image…' : 'Choose image…'}</button>${pairSelect(`${P}.fit`, 'Placement', FIT_OPTIONS, b.fit ?? 'free')}`
        : `<label>${b.kind === 'amount' ? 'Amount' : 'Text'} <input data-path="${P}.text" value="${attr(b.text)}" ${b.kind === 'amount' ? 'disabled' : ''}></label>
           ${color(`${P}.color`, 'Colour')}
           <div class="font-row">${pairSelect(`${P}.font`, 'Font', fontOptions(), b.font ?? 'system')}<button data-font-up="${i}">Upload font…</button></div>`;
      const style = isImg ? '' : select(`${P}.weight`, 'Weight', ['400', '600', '800']) + select(`${P}.align`, 'Align', ['left', 'center', 'right']);
      return `<div class="block-row" id="block-${i}">
        <div class="block-head"><b>${i + 1}. ${b.kind}</b><button data-del="${i}" title="Delete">✕</button></div>
        ${content}
        <div class="block-grid">
          ${num(`${P}.x`, 'X %', 0, 100)}${num(`${P}.y`, 'Y %', 0, 100)}${num(`${P}.size`, b.kind === 'image' ? 'Width %' : 'Size pt', 1, 200)}
          ${style}
        </div>
      </div>`;
    })
    .join('');
}

function bindRegionAndPage(): void {
  const loc = document.getElementById('region-locale') as HTMLSelectElement;
  const cur = document.getElementById('region-currency') as HTMLSelectElement;
  const ex = document.getElementById('region-example')!;
  const showEx = () => (ex.textContent = formatCurrency(7800, preset.region));
  showEx();
  const onRegion = () => {
    const p = structuredClone(preset);
    p.region = { locale: loc.value, currency: cur.value };
    p.game.currency = { ...p.game.currency, ...separatorsFor(p.region) };
    commit(p, 'region.');
    showEx();
  };
  loc.addEventListener('change', onRegion);
  cur.addEventListener('change', onRegion);

  document.getElementById('page-bg-up')!.addEventListener('click', async () => {
    const f = await pickImage();
    if (!f) return;
    const p = structuredClone(preset);
    p.page.backgroundImage = await fileToWallpaper(f);
    commit(p, 'page.background');
  });
  document.getElementById('page-bg-clear')!.addEventListener('click', () => {
    const p = structuredClone(preset);
    delete p.page.backgroundImage;
    commit(p, 'page.background');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = structuredClone(preset);
      const kind = b.dataset.add as PageBlockKind;
      p.page.blocks.push({
        kind, x: 50, y: 50, text: kind === 'amount' ? '{balance}' : 'New text', size: kind === 'image' ? 40 : 18,
        fit: kind === 'image' ? 'cover' : undefined,
        color: '#ffffff', weight: kind === 'amount' ? '800' : '600', align: 'center',
      });
      commit(p, `page.blocks.${p.page.blocks.length - 1}.text`);
      void renderStudio();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = structuredClone(preset);
      p.page.blocks.splice(Number(b.dataset.del), 1);
      commit(p, 'page.');
      void renderStudio();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-font-up]').forEach((b) =>
    b.addEventListener('click', async () => {
      const f = await pickFile('.ttf,.otf,.woff,.woff2,font/*');
      if (!f) return;
      const font = await fileToFont(f);
      const p = structuredClone(preset);
      p.customFonts = [...p.customFonts.filter((c) => c.name !== font.name), font];
      p.page.blocks[Number(b.dataset.fontUp)].font = `custom:${font.name}`;
      commit(p, `page.blocks.${b.dataset.fontUp}.text`);
      void renderStudio();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-block-img]').forEach((b) =>
    b.addEventListener('click', async () => {
      const f = await pickImage();
      if (!f) return;
      const p = structuredClone(preset);
      p.page.blocks[Number(b.dataset.blockImg)].imageSrc = await fileToWallpaper(f);
      commit(p, `page.blocks.${b.dataset.blockImg}.text`);
      void renderStudio();
    }),
  );
}

/** Notification icon: pick from the icon collection or upload a PNG. */
async function bindPushIcon(): Promise<void> {
  const img = document.getElementById('push-icon-img') as HTMLImageElement | null;
  const sel = document.getElementById('push-icon-sel') as HTMLSelectElement | null;
  const up = document.getElementById('push-icon-up');
  if (!img || !sel || !up) return;
  const cat = await loadCatalog();
  const refresh = () => {
    const p = preset.push;
    img.src = p.iconId === 'custom' ? (p.customSrc ?? '') : (cat.find((c) => c.id === p.iconId)?.url ?? '');
    sel.value = p.iconId;
  };
  sel.innerHTML = cat.map((c) => `<option value="${attr(c.id)}">${c.label}</option>`).join('') + '<option value="custom">Uploaded PNG</option>';
  refresh();
  sel.addEventListener('change', () => {
    const p = structuredClone(preset);
    p.push.iconId = sel.value;
    commit(p);
    refresh();
  });
  up.addEventListener('click', async () => {
    const f = await pickImage();
    if (!f) return;
    const p = structuredClone(preset);
    p.push.iconId = 'custom';
    p.push.customSrc = await fileToIcon(f);
    commit(p);
    refresh();
  });
}

/** Fields for the element-based variant, from its script.json. */
async function renderCodeValues(box: HTMLElement): Promise<void> {
  let list: { key: string; label: string; default: number }[] = [];
  try {
    const script = await fetch('./private/coin-volcano/code/script.json').then((r) => r.json());
    list = editableValues(script);
  } catch {
    box.innerHTML = '<p class="note">Game files are not on this build.</p>';
    return;
  }
  box.innerHTML =
    list
      .map((v) => {
        const cur = preset.game.values[v.key];
        return `<label>${v.label} <input data-value-key="${attr(v.key)}" type="number" inputmode="decimal" step="0.01" placeholder="${v.default}" value="${cur ?? ''}"></label>`;
      })
      .join('') + '<p class="note">Totals are computed: bar = sum of coins, big win = total × multiplier.</p>';
  bindValueInputs(box);
}

function bindValueInputs(box: HTMLElement): void {
  box.querySelectorAll<HTMLInputElement>('[data-value-key]').forEach((el) =>
    el.addEventListener('change', () => {
      const p = structuredClone(preset);
      const k = el.dataset.valueKey!;
      if (el.value === '') delete p.game.values[k];
      else p.game.values[k] = Number(el.value);
      commit(p, k);
    }),
  );
}

/** One editable field per number found in the plate's patches.json. */
async function renderGameValues(): Promise<void> {
  const box = document.getElementById('game-values');
  if (!box) return;
  if (preset.game.variant === 'code') return renderCodeValues(box);
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
  bindValueInputs(box);
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
  let rec: Recording | null = null;
  try {
    rec = recorder ? await recorder.stop() : null;
  } catch (e) {
    console.warn('recorder stop failed', e);
  }
  recorder = null;
  try {
    stage?.destroy();
  } catch (e) {
    console.warn('stage destroy failed', e);
  }
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
  const variant = qs.get('variant');
  if (variant === 'plate' || variant === 'code') preset = { ...preset, game: { ...preset.game, variant } };
  if (qs.has('auto')) preset = { ...preset, game: { ...preset.game, manualSpin: false } };
  void startPreview()
    .then(() => stage?.openGameDirect(t === null ? undefined : Number(t)))
    .then(() => (qs.has('page') ? stage?.debugOpenPage() : qs.has('push') ? stage?.debugShowPush() : undefined));
}
