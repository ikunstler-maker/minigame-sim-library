/**
 * Standalone test page for the plate (open /plate-test.html on the dev server).
 * Mounts PlateGame full-screen, scaled to fit, with a time/state readout.
 * Query flags: ?silent (no soundtrack), ?noTap (hide tap-area outlines).
 */
import { Application } from 'pixi.js';
import { AudioBus } from '../../audio/AudioBus';
import { STAGE_H, STAGE_W } from '../../config';
import { PlateGame } from './PlateGame';

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const app = new Application();
  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    background: '#000000',
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
  });
  const canvas = app.canvas;
  canvas.id = 'plate-canvas';
  document.getElementById('wrap')!.appendChild(canvas);

  const fit = () => {
    const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
    canvas.style.width = `${STAGE_W * s}px`;
    canvas.style.height = `${STAGE_H * s}px`;
  };
  addEventListener('resize', fit);
  fit();

  const bus = params.has('silent') ? null : new AudioBus();
  const game = new PlateGame({ audio: bus, ticker: app.ticker, showTapAreas: !params.has('noTap') });
  const readout = document.getElementById('readout')!;
  const log = (msg: string) => console.log('[plate-test]', msg);
  game.onHold = (h) => log(`hold ${h.label} at ${h.t}s`);
  game.onRelease = (h) => log(`released ${h.label}`);
  game.onFinished = () => log('finished');

  readout.textContent = 'loading…';
  const t0 = performance.now();
  await game.load();
  log(`loaded in ${Math.round(performance.now() - t0)} ms`);
  app.stage.addChild(game);
  game.start();

  app.ticker.add(() => {
    const t = game.time;
    readout.textContent = `${t.toFixed(3)} s  f${Math.round(t * 30)}  ${game.state}${bus ? `  audio:${bus.ctx.state}` : ''}`;
  });
  // Expose for manual poking from the console.
  (window as unknown as { plate: PlateGame }).plate = game;
}

main().catch((e) => {
  document.getElementById('readout')!.textContent = `error: ${e instanceof Error ? e.message : String(e)}`;
  console.error(e);
});
