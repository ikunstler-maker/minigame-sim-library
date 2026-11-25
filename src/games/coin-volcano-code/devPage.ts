/**
 * Dev page for the Coin Volcano "code" take (open /code-test.html on the dev server).
 * Query flags: ?t=12 freeze at 12 s; ?silent no soundtrack; ?auto=1500 auto-continue holds.
 * `window.code` is the CodeGame instance.
 */
import { Application } from 'pixi.js';
import { AudioBus } from '../../audio/AudioBus';
import { STAGE_H, STAGE_W } from '../../config';
import { CodeGame } from './CodeGame';

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: '#000000', resolution: 1, autoDensity: false, preference: 'webgl', preserveDrawingBuffer: true });
  const canvas = app.canvas;
  canvas.id = 'code-canvas';
  document.getElementById('wrap')!.appendChild(canvas);
  const fit = () => {
    const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
    canvas.style.width = `${STAGE_W * s}px`;
    canvas.style.height = `${STAGE_H * s}px`;
  };
  addEventListener('resize', fit);
  fit();

  const freeze = params.get('t');
  const auto = params.get('auto');
  const bus = params.has('silent') || freeze !== null ? null : new AudioBus();
  const readout = document.getElementById('readout')!;
  const game = new CodeGame({
    audio: bus,
    ticker: app.ticker,
    autoContinueMs: auto !== null ? Number(auto) : undefined,
    onProgress: (p) => { readout.textContent = `loading ${Math.round(p * 100)}%`; },
  });
  (window as unknown as { code: CodeGame }).code = game;
  game.onFinished = () => console.log('[code-test] finished');
  await game.load();
  app.stage.addChild(game);
  if (freeze !== null) await game.debugFreeze(Number(freeze));
  else game.start();
  app.ticker.add(() => {
    const t = game.time;
    readout.textContent = `${t.toFixed(3)} s  f${Math.round(t * 30)}  ${game.state}${bus ? `  audio:${bus.ctx.state}` : ''}`;
  });
}

main().catch((e) => {
  document.getElementById('readout')!.textContent = `error: ${e instanceof Error ? e.message : String(e)}`;
  console.error(e);
});
