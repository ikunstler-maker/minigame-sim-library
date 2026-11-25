/**
 * Dev page for the FX library (fx-test.html). A 1080x2340 stage with a 3x3 coin grid, a time slider
 * and buttons that schedule each effect. URL: ?fx=<name>&at=<t0>&t=<time> schedules one recipe and
 * freezes at `t` (used by the headless capture). `window.fxPage` exposes setTime / schedule.
 */
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Effect, FxRunner, burst, fireColumn, fireTrail, flare, landingPop, punch, screenFlash, whirlSpin } from './index';

const XS = [208, 541, 873];
const YS = [855, 1112, 1369];
const COIN = 270;
const BAR = { x: 541, y: 1548 };
const T_MAX = 10;

type Recipe = { name: string; t0: number };

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ width: 1080, height: 2340, background: 0x3a0707, antialias: true, preference: 'webgl' });
  const wrap = document.getElementById('stage-wrap')!;
  wrap.appendChild(app.canvas);
  const bar = document.getElementById('bar')!;
  const fit = (): void => {
    const top = bar.offsetHeight;
    wrap.style.top = `${top}px`;
    const s = Math.min(window.innerWidth / 1080, (window.innerHeight - top) / 2340);
    app.canvas.style.width = `${1080 * s}px`;
    app.canvas.style.height = `${2340 * s}px`;
  };
  window.addEventListener('resize', fit);
  fit();

  const coinTex = await Assets.load<Texture>('./private/coin-volcano/plate/coins/coin-gold.png');
  const whirlTex = await Assets.load<Texture>('./private/coin-volcano/plate/coins/whirl.png');

  const board = new Graphics();
  for (const y of YS) for (const x of XS) board.roundRect(x - 160, y - 124, 320, 248, 12).fill({ color: 0x1c0204, alpha: 0.8 });
  board.roundRect(BAR.x - 280, BAR.y - 40, 560, 80, 20).fill({ color: 0x5a0a06 }).stroke({ color: 0xd08020, width: 4 });
  app.stage.addChild(board);

  const pieces = new Container();
  app.stage.addChild(pieces);
  const coins: Sprite[] = [];
  YS.forEach((y, r) => XS.forEach((x, c) => {
    const isWhirl = r === 2 && c === 2;
    const s = new Sprite(isWhirl ? whirlTex : coinTex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = s.height = isWhirl ? 290 : COIN;
    pieces.addChild(s);
    coins.push(s);
  }));
  const baseScale = coins.map((s) => ({ x: s.scale.x, y: s.scale.y }));
  const whirl = coins[8];
  const x4 = new Text({ text: 'X4', style: { fontSize: 170, fontWeight: '900', fill: 0xffe27a, stroke: { color: 0x7a1000, width: 14 } } });
  x4.anchor.set(0.5);
  x4.position.set(XS[1], YS[1]);
  x4.visible = false;
  pieces.addChild(x4);

  const fxLayer = new Container();
  const flashLayer = new Container();
  app.stage.addChild(fxLayer, flashLayer);

  const runner = new FxRunner();
  let recipes: Recipe[] = [];
  let t = 0;
  let lastT = 0;
  let playing = false;
  const at = (i: number) => ({ x: coins[i].x, y: coins[i].y });

  const build = (rc: Recipe): Effect[] => {
    const t0 = rc.t0;
    switch (rc.name) {
      case 'trail': return [fireTrail(fxLayer, at(1), at(8), t0, 1.1), burst(fxLayer, at(8), t0 + 0.9, { radius: 120 })];
      case 'column': return [0, 3, 4, 5, 7].map((i, k) => fireColumn(fxLayer, at(i), BAR, t0 + k * 0.35, 0.9));
      case 'flare': return [0, 3, 4, 5].map((i) => flare(fxLayer, at(i), COIN / 2, t0, 2, { pulses: 2 }));
      case 'pop': return [3, 4, 5].flatMap((i, k) => [landingPop(coins[i], t0 + k * 0.25), burst(fxLayer, at(i), t0 + k * 0.25, { radius: 110, count: 12 })]);
      case 'burst': return [burst(fxLayer, at(4), t0)];
      case 'x4': return [punch(x4, t0, 0.8, 3, 1), screenFlash(flashLayer, t0, 1.2)];
      case 'flash': return [screenFlash(flashLayer, t0, 1.2)];
      case 'whirl': return [whirlSpin(whirl, t0)];
      case 'demo': return [
        ...build({ name: 'whirl', t0 }),
        ...build({ name: 'pop', t0: t0 + 0.2 }),
        ...build({ name: 'flare', t0: t0 + 1.2 }),
        ...build({ name: 'trail', t0: t0 + 3.3 }),
        fireTrail(fxLayer, at(0), at(8), t0 + 4.3, 1.1, { arc: -0.3 }),
        ...build({ name: 'x4', t0: t0 + 5.7 }),
        ...build({ name: 'column', t0: t0 + 7.0 }),
      ];
      default: return [];
    }
  };
  const rebuild = (): void => {
    runner.clear();
    coins.forEach((s, i) => { s.scale.set(baseScale[i].x, baseScale[i].y); s.rotation = 0; });
    x4.scale.set(1);
    for (const rc of recipes) for (const e of build(rc)) runner.add(e);
  };
  const x4Start = (): number => {
    const r = recipes.filter((q) => q.name === 'x4' || q.name === 'demo').map((q) => q.t0 + (q.name === 'demo' ? 5.7 : 0));
    return r.length ? Math.min(...r) : Infinity;
  };

  const slider = document.getElementById('time') as HTMLInputElement;
  const readout = document.getElementById('readout')!;
  const playBtn = document.getElementById('play')!;
  const setTime = (nt: number): void => {
    t = Math.max(0, Math.min(T_MAX, nt));
    if (t < lastT) rebuild();
    lastT = t;
    runner.update(t);
    x4.visible = t >= x4Start();
    slider.value = String(t);
    readout.textContent = `${t.toFixed(2)} s`;
  };
  const schedule = (name: string, t0: number): void => {
    recipes.push({ name, t0 });
    rebuild();
    setTime(t);
  };
  playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; };
  slider.oninput = () => setTime(parseFloat(slider.value));
  const btns = document.getElementById('buttons')!;
  for (const name of ['trail', 'flare', 'pop', 'burst', 'x4', 'flash', 'whirl', 'column', 'demo']) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      if (name === 'demo') { recipes = []; setTime(0); schedule('demo', 0); } else schedule(name, t + 0.1);
      playing = true;
      playBtn.textContent = 'Pause';
    };
    btns.appendChild(b);
  }
  const clr = document.createElement('button');
  clr.textContent = 'clear';
  clr.onclick = () => { recipes = []; rebuild(); setTime(t); };
  btns.appendChild(clr);
  fit();

  app.ticker.add((tk) => {
    if (!playing) return;
    const nt = t + tk.deltaMS / 1000;
    setTime(nt >= T_MAX ? 0 : nt);
  });

  const q = new URLSearchParams(location.search);
  if (q.get('fx')) {
    for (const name of q.get('fx')!.split(',')) recipes.push({ name, t0: parseFloat(q.get('at') ?? '0.2') });
    rebuild();
  }
  setTime(parseFloat(q.get('t') ?? '0'));
  (window as unknown as { fxPage: unknown }).fxPage = { setTime, schedule, get time() { return t; }, ready: true };
}

void main();
