import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { PT, STAGE_H, STAGE_W, type Preset } from '../config';
import type { AudioBus } from '../audio/AudioBus';
import { loadCatalog, slotUrl } from '../ios/iconCatalog';
import { NotificationBanner } from './ios/NotificationBanner';
import { GameStub } from './GameStub';
import { loadTexture } from './textures';
import { PlateGame } from '../games/coin-volcano-plate/PlateGame';
import { CodeGame } from '../games/coin-volcano-code/CodeGame';
import { NumbersLayer, deriveTotals, type PatchText } from '../games/coin-volcano-plate/numbersLayer';
import { loadGameFonts } from '../games/coin-volcano-plate/numbers/numberStyles';
import { HomeScreen, ICON, type OpenRequest } from './ios/HomeScreen';
import { StatusBar } from './ios/StatusBar';
import { TestScene } from './TestScene';
import { easeOutCubic, tween } from './tween';

/** Corner radius of the iPhone display, used for the opened app window. */
const SCREEN_RADIUS = 55 * PT;

/**
 * Owns the PixiJS application and the scene flow of a take:
 * iOS home screen → app-open zoom → game. Everything is on one canvas.
 */
export class StageApp {
  readonly app = new Application();
  private scenes = new Container();
  private statusLayer = new Container();
  private busy = false;
  private gamePromise: Promise<PlateGame | CodeGame | null> | null = null;
  private home: HomeScreen | null = null;

  constructor(private readonly preset: Preset, private readonly audio: AudioBus) {}

  /** Create the renderer and the first scene. Resolves when the first frame is ready. */
  async init(): Promise<HTMLCanvasElement> {
    await this.app.init({
      width: STAGE_W,
      height: STAGE_H,
      background: this.preset.background,
      antialias: true,
      resolution: 1,
      autoDensity: false,
      preserveDrawingBuffer: true,
      // WebGPU canvases do not feed canvas.captureStream reliably; WebGL does.
      preference: 'webgl',
    });
    this.app.stage.addChild(this.scenes, this.statusLayer);

    if (this.preset.testTone) {
      const test = new TestScene(this.preset, this.audio);
      this.scenes.addChild(test);
      this.app.ticker.add((t) => test.update(t.deltaMS));
    } else {
      const home = await HomeScreen.create(this.preset, await loadCatalog());
      home.onOpen = (req) => void this.openApp(home, req);
      this.home = home;
      home.setGameProgress(0);
      this.scenes.addChild(home);
      // Preload the game while the home screen is on, so the tap opens it at once.
      this.gamePromise = this.loadGame();
    }
    this.statusLayer.addChild(new StatusBar(this.preset.statusBar));
    return this.app.canvas;
  }

  /** iOS-style zoom from the tapped icon to a full-screen app window. */
  private async openApp(home: HomeScreen, req: OpenRequest): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const win = new Container();
    const content = (await (this.gamePromise ?? this.loadGame())) ?? new GameStub(req.slot.label, req.texture);
    const iconArt = req.texture ? new Sprite(req.texture) : null;
    const mask = new Graphics();
    win.addChild(content);
    if (iconArt) win.addChild(iconArt);
    win.mask = mask;
    this.scenes.addChild(win, mask);

    const dim = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(0x000000);
    dim.alpha = 0;
    this.scenes.addChildAt(dim, this.scenes.getChildIndex(win));

    const cx = req.x + req.size / 2, cy = req.y + req.size / 2;
    const lightBar = new StatusBar({ ...this.preset.statusBar, style: 'light' });
    lightBar.alpha = 0;
    this.statusLayer.addChild(lightBar);
    const darkBar = this.statusLayer.children[0];

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    await tween(this.app.ticker, this.preset.appOpenMs, (k) => {
      const w = lerp(req.size, STAGE_W, k);
      const h = lerp(req.size, STAGE_H, k);
      const x = lerp(req.x, 0, k);
      const y = lerp(req.y, 0, k);
      const r = lerp(ICON * 0.225, SCREEN_RADIUS, k);
      mask.clear().roundRect(x, y, w, h, r).fill(0xffffff);
      // content scales with the window width, centred vertically
      const s = w / STAGE_W;
      content.scale.set(s);
      content.position.set(x, y + (h - STAGE_H * s) / 2);
      if (iconArt) {
        const side = w; // icon keeps its square shape, grows with the window width
        iconArt.width = iconArt.height = side;
        iconArt.position.set(x, y + (h - side) / 2);
        iconArt.alpha = 1 - Math.min(1, k / 0.35);
      }
      // home zooms slightly towards the icon and dims
      const hs = 1 + 0.12 * k;
      home.scale.set(hs);
      home.position.set(cx - cx * hs, cy - cy * hs);
      dim.alpha = 0.25 * k;
      lightBar.alpha = k;
      darkBar.alpha = 1 - k;
    }, easeOutCubic);

    win.mask = null;
    mask.destroy();
    iconArt?.destroy();
    home.visible = false;
    dim.visible = false;
    darkBar.visible = false;
    if (content instanceof PlateGame || content instanceof CodeGame) content.start();
    this.busy = false;
  }

  /**
   * Load the plate game with its numbers. Returns null when the private plate files
   * are not on this build (e.g. the public site), so the placeholder is shown instead.
   */
  private async loadGame(): Promise<PlateGame | CodeGame | null> {
    const g = this.preset.game;
    if (g.variant === 'code') return this.loadCodeGame();
    if (g.variant !== 'plate') {
      this.home?.setGameProgress(1);
      return null;
    }
    try {
      await loadGameFonts();
      const base = './private/coin-volcano/plate/';
      let items: { id?: string; text?: PatchText }[] = [];
      try {
        const json = await fetch(`${base}patches.json`).then((r) => r.json());
        items = Array.isArray(json) ? json : (json.items ?? []);
      } catch {
        /* no patches: plain plate */
      }
      const [gold, red, whirl] = await Promise.all(['coin-gold', 'coin-red', 'whirl'].map((n) => loadTexture(`${base}coins/${n}.png`)));
      const numbers = new NumbersLayer(deriveTotals(items, g.values), g.currency, { gold, red, whirl });
      const game = new PlateGame({
        baseUrl: base,
        audio: g.soundtrack === 'off' ? null : this.audio,
        audioUrl: g.soundtrack === 'sfx' ? `${base}audio-sfx.m4a` : `${base}audio.m4a`,
        ticker: this.app.ticker,
        makeContent: numbers.makeContent,
        showTapAreas: g.showTapAreas,
        autoContinueMs: g.manualSpin ? undefined : g.autoContinueMs,
        onProgress: (p) => this.home?.setGameProgress(p),
      });
      await game.load();
      this.app.ticker.add(() => numbers.update(game.time));
      game.onFinished = () => this.schedulePush();
      return game;
    } catch (e) {
      console.warn('Plate game unavailable, showing placeholder:', e);
      this.home?.setGameProgress(1);
      return null;
    }
  }

  /** Element-based variant: every symbol and number is our own element (no video under the board). */
  private async loadCodeGame(): Promise<CodeGame | null> {
    const g = this.preset.game;
    try {
      await loadGameFonts();
      const base = './private/coin-volcano/';
      const game = new CodeGame({
        baseUrl: base,
        audio: g.soundtrack === 'off' ? null : this.audio,
        audioUrl: g.soundtrack === 'off' ? null : `${base}plate/${g.soundtrack === 'sfx' ? 'audio-sfx' : 'audio'}.m4a`,
        ticker: this.app.ticker,
        values: g.values,
        currency: g.currency,
        autoContinueMs: g.manualSpin ? undefined : g.autoContinueMs,
        onProgress: (p) => this.home?.setGameProgress(p),
      });
      await game.load();
      game.onFinished = () => this.schedulePush();
      return game;
    } catch (e) {
      console.warn('Code game unavailable, showing placeholder:', e);
      this.home?.setGameProgress(1);
      return null;
    }
  }

  /**
   * Dev aid: open the game directly (no home screen) and, when `t` is given,
   * freeze on that video time. Used by `?game&t=12` for calibration.
   */
  async openGameDirect(t?: number): Promise<void> {
    const game = await (this.gamePromise ?? this.loadGame());
    if (!game) return;
    this.scenes.removeChildren();
    this.scenes.addChild(game);
    if (t === undefined) game.start();
    else await game.debugFreeze(t);
    (window as unknown as { plate: PlateGame | CodeGame }).plate = game;
  }

  /** Show the end-of-take notification banner (Stage 5 adds tap → layout page). */
  private schedulePush(): void {
    const p = this.preset.push;
    if (!p.enabled) return;
    setTimeout(() => void this.showPush(), Math.max(0, p.delayMs));
  }

  /** Dev aid: show the notification now (`?game&t=38&push`). */
  debugShowPush(): Promise<void> {
    return this.showPush();
  }

  private async showPush(): Promise<void> {
    if (this.app.renderer === null) return;
    const p = this.preset.push;
    const url = p.iconId === 'custom' ? (p.customSrc ?? '') : slotUrl({ iconId: p.iconId, label: '', role: 'app' }, await loadCatalog());
    const banner = new NotificationBanner(p, await loadTexture(url));
    this.statusLayer.addChild(banner);
    await banner.show(this.app.ticker);
  }

  /** Tear down the renderer and all scenes. */
  destroy(): void {
    // Stop the game before the renderer and its ticker go away.
    this.app.ticker.stop();
    for (const c of [...this.scenes.children]) {
      try {
        c.destroy({ children: true });
      } catch (e) {
        console.warn('scene destroy failed', e);
      }
    }
    void this.gamePromise?.then((g) => {
      try {
        if (g && !g.destroyed) g.destroy();
      } catch {
        /* already gone */
      }
    });
    try {
      this.app.destroy(true, { children: true });
    } catch (e) {
      console.warn('app destroy failed', e);
    }
  }
}
