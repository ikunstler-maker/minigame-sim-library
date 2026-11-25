import { Application } from 'pixi.js';
import './style.css';
import { STAGE_H, STAGE_W, loadPreset, savePreset, type Preset } from './config';
import { AudioBus } from './audio/AudioBus';
import { CanvasRecorder, pickMimeType, type Recording } from './recorder/CanvasRecorder';
import { TestScene } from './stage/TestScene';

const studioEl = document.getElementById('studio')!;
const previewEl = document.getElementById('preview')!;
const wrapEl = document.getElementById('stage-wrap')!;
const hotspotEl = document.getElementById('exit-hotspot')!;
const exportEl = document.getElementById('export')!;

let preset: Preset = loadPreset();
let app: Application | null = null;
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

// ---------- Studio ----------
function renderStudio(): void {
  const mime = pickMimeType() || 'not supported';
  studioEl.innerHTML = `
    <h1>Sim Studio <small>Stage 1</small></h1>
    <section>
      <label>Clock <input id="f-clock" value="${preset.clock}"></label>
      <label>Background <input id="f-bg" type="color" value="${preset.background}"></label>
      <label><input id="f-tone" type="checkbox" ${preset.testTone ? 'checked' : ''}> Test beep every second</label>
      <label><input id="f-auto" type="checkbox" ${preset.autoRecord ? 'checked' : ''}> Record automatically</label>
      <label>FPS <select id="f-fps">${[30, 60].map((f) => `<option ${f === preset.fps ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    </section>
    <button id="b-preview" class="primary">▶ Preview</button>
    <p class="note">Recording format on this device: <b>${mime}</b></p>
    <p class="note">To finish a take: tap the clock (top-left) ${preset.exitTapCount} times quickly.</p>
  `;
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement);
  const sync = () => {
    preset = {
      ...preset,
      clock: val('f-clock').value,
      background: val('f-bg').value,
      testTone: val('f-tone').checked,
      autoRecord: val('f-auto').checked,
      fps: Number(val('f-fps').value),
    };
    savePreset(preset);
  };
  studioEl.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', sync));
  document.getElementById('b-preview')!.addEventListener('click', () => void startPreview());
}

// ---------- Preview ----------
async function startPreview(): Promise<void> {
  show('preview');
  // AudioContext must be created/resumed inside the tap that opened Preview (iOS).
  audio ??= new AudioBus();
  await audio.resume();

  app = new Application();
  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    background: preset.background,
    antialias: true,
    resolution: 1,
    autoDensity: false,
    preserveDrawingBuffer: true,
    // WebGPU canvases do not feed canvas.captureStream reliably; WebGL does.
    preference: 'webgl',
  });
  wrapEl.prepend(app.canvas);
  const scene = new TestScene(preset, audio);
  app.stage.addChild(scene);
  app.ticker.add((t) => scene.update(t.deltaMS));
  fitStage();

  if (preset.autoRecord) {
    recorder = new CanvasRecorder(app.canvas, audio.recordStream);
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
  app?.destroy(true, { children: true });
  app = null;
  if (rec) {
    lastRecording = rec;
    renderExport();
  } else {
    show('studio');
  }
}

/** Fit the 9:16 stage inside the viewport (letterboxed). */
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
    renderStudio();
    show('studio');
  });
}

renderStudio();
show('studio');
