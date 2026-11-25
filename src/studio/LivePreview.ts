import { Application, Container, Graphics } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, PT, STAGE_H, STAGE_W, type Preset } from '../config';
import { createGame, createPushBanner, takeValues, type AnyGame } from '../games/createGame';
import { PageScene } from '../stage/PageScene';
import { randomId } from '../money';
import { loadCatalog } from '../ios/iconCatalog';
import { HomeScreen, ICON, cellPos } from '../stage/ios/HomeScreen';
import { StatusBar } from '../stage/ios/StatusBar';
import { WIDGET_H, WIDGET_W } from '../stage/ios/WeatherWidget';

export type LiveScene = 'home' | 'game' | 'push' | 'page';

/** What a tap on the phone mock points at. */
export interface Pick {
  /** Settings section id to open (sec-home, sec-status, sec-weather, sec-game, sec-push). */
  section: string;
  /** Value key (game numbers) or data-path of a field to focus. */
  field?: string;
  /** Home-screen slot to open in the icon sheet. */
  slot?: { area: 'grid' | 'dock'; index: number };
  label: string;
}

interface Region extends Pick {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlateLayout {
  cells: { x: number[]; y: number[] };
  coinR: number;
  plates: Record<'grand' | 'major' | 'minor' | 'mini', { cx: number; cy: number; height: number }>;
  bet: { cx: number; cy: number; height: number };
  balance: { cx: number; cy: number; height: number };
  totalBar?: { x: number; y: number; w: number; h: number };
}

const STATUS_H = 54 * PT;
const BOARD_SWITCH = 8.9;
const PUSH_TIME = 38.5;

/**
 * Studio live phone mock: the same scenes the recording uses, rendered from the
 * current preset. Tapping an element reports what it is (onPick); `flash(hint)`
 * outlines the element a setting changes.
 */
export class LivePreview {
  readonly app = new Application();
  private scene: LiveScene = 'home';
  private time = 14;
  private preset!: Preset;
  private root = new Container();
  private overlay = new Container();
  private regions: Region[] = [];
  private game: AnyGame | null = null;
  private gameKey = '';
  private building: Promise<void> | null = null;
  private layout: { base: PlateLayout; bonus: PlateLayout } | null = null;
  private status = '';
  /** Stable {id} while editing (a new one is drawn for every recorded take). */
  private readonly takeId = randomId();

  /** Fired when the mock is tapped on an editable element. */
  onPick: (p: Pick) => void = () => {};
  /** Fired with a short status line (loading, scene…). */
  onStatus: (s: string) => void = () => {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: STAGE_W,
      height: STAGE_H,
      resolution: 0.45,
      autoDensity: false,
      antialias: true,
      background: '#000000',
      preference: 'webgl',
    });
    this.app.stage.addChild(this.root, this.overlay);
    host.appendChild(this.app.canvas);
    this.app.canvas.addEventListener('pointerdown', (e) => this.tap(e));
    try {
      this.layout = await fetch('./private/coin-volcano/code/layout.json').then((r) => r.json());
    } catch {
      this.layout = null;
    }
  }

  /** Move the canvas into a (re-rendered) host element. */
  attach(host: HTMLElement): void {
    host.appendChild(this.app.canvas);
  }

  setScene(s: LiveScene): Promise<void> {
    this.scene = s;
    return this.rebuild();
  }

  /** Game scene: show the moment at `t` seconds. */
  async setTime(t: number): Promise<void> {
    this.time = t;
    if (this.scene !== 'game' || !this.game) return;
    await this.game.debugFreeze(t);
    this.regions = this.gameRegions(t);
  }

  /** New preset: rebuild what it affects, then outline the changed element. */
  async update(preset: Preset, hint?: string): Promise<void> {
    this.preset = preset;
    await this.rebuild();
    if (hint) this.flash(hint);
  }

  private setStatus(s: string): void {
    if (s !== this.status) this.onStatus((this.status = s));
  }

  private async rebuild(): Promise<void> {
    if (!this.preset) return;
    const run = async () => {
      this.root.removeChildren();
      if (this.scene === 'page') {
        this.setStatus('');
        const v = await takeValues(this.preset, this.takeId);
        const page = await PageScene.create(this.preset.page, v, this.preset.region);
        this.root.addChild(page, new StatusBar({ ...this.preset.statusBar, style: 'light' }));
        this.regions = [
          { x: 0, y: 0, w: STAGE_W, h: STAGE_H, section: 'sec-page', field: 'page.background', label: 'Page background' },
          ...page.blockRects.map((r) => ({ ...r, section: 'sec-page', field: `page.blocks.${r.index}.text`, label: `Block ${r.index + 1}` })),
        ];
        if (!this.preset.page.enabled) page.alpha = 0.35;
        return;
      }
      if (this.scene === 'home') {
        this.setStatus('');
        const home = await HomeScreen.create(this.preset, await loadCatalog());
        this.root.addChild(home, new StatusBar(this.preset.statusBar));
        this.regions = this.homeRegions();
        return;
      }
      const game = await this.ensureGame();
      if (!game) {
        this.setStatus('Game files are not on this build.');
        this.regions = [];
        return;
      }
      this.root.addChild(game, new StatusBar({ ...this.preset.statusBar, style: 'light' }));
      const t = this.scene === 'push' ? PUSH_TIME : this.time;
      await game.debugFreeze(t);
      this.regions = this.gameRegions(t);
      if (this.scene === 'push') {
        const banner = await createPushBanner(this.preset, await takeValues(this.preset, this.takeId));
        banner.placeShown();
        this.root.addChild(banner);
        const b = banner.getBounds();
        this.regions.push({ x: b.x, y: b.y, w: b.width, h: b.height, section: 'sec-push', label: 'Notification' });
        if (!this.preset.push.enabled) banner.alpha = 0.35;
      }
      this.setStatus('');
    };
    // serialise rebuilds; the latest preset wins
    const prev = this.building;
    const next = (async () => {
      await prev?.catch(() => undefined);
      await run();
    })();
    this.building = next;
    return next;
  }

  /** The game is rebuilt only when its settings change (it downloads media). */
  private async ensureGame(): Promise<AnyGame | null> {
    const key = JSON.stringify(this.preset.game);
    if (this.game && key === this.gameKey) return this.game;
    this.game?.destroy();
    this.game = null;
    this.setStatus('Loading the game…');
    this.game = await createGame(this.preset, {
      ticker: this.app.ticker,
      audio: null,
      onProgress: (p) => this.setStatus(p < 1 ? `Loading the game… ${Math.round(p * 100)}%` : 'Preparing…'),
    });
    this.gameKey = key;
    return this.game;
  }

  // ---------- regions ----------

  private homeRegions(): Region[] {
    const r: Region[] = [];
    const p = this.preset;
    const widgetRows = p.weather.enabled ? [p.weather.row, p.weather.row + 1] : [];
    // wallpaper first: everything else sits on top of it
    r.push({ x: 0, y: STATUS_H, w: STAGE_W, h: STAGE_H - STATUS_H, section: 'sec-home', label: 'Wallpaper' });
    r.push({ x: 0, y: 0, w: STAGE_W, h: STATUS_H, section: 'sec-status', label: 'Status bar' });
    if (p.weather.enabled) {
      const c = cellPos(p.weather.row * GRID_COLS);
      r.push({ x: c.x, y: c.y, w: WIDGET_W, h: WIDGET_H, section: 'sec-weather', label: 'Weather widget' });
    }
    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      if (widgetRows.includes(Math.floor(i / GRID_COLS))) continue;
      const c = cellPos(i);
      r.push({ x: c.x, y: c.y, w: ICON, h: ICON + 20 * PT, section: 'sec-home', slot: { area: 'grid', index: i }, label: `Icon ${i + 1}` });
    }
    const pitch = cellPos(1).x - cellPos(0).x;
    const dockY = STAGE_H - 10 * PT - 92 * PT - 8 * PT;
    for (let i = 0; i < 4; i++) {
      r.push({ x: cellPos(0).x + i * pitch, y: dockY + (92 * PT - ICON) / 2, w: ICON, h: ICON, section: 'sec-home', slot: { area: 'dock', index: i }, label: `Dock ${i + 1}` });
    }
    return r;
  }

  private gameRegions(t: number): Region[] {
    const r: Region[] = [{ x: 0, y: 0, w: STAGE_W, h: STATUS_H, section: 'sec-status', label: 'Status bar' }];
    if (!this.layout || t >= 30.3) {
      if (t >= 30.3) r.push({ x: 140, y: 1300, w: 800, h: 260, section: 'sec-game', field: 'jackpot:grand', label: 'Big win = total × multiplier' });
      return r;
    }
    const board = t < BOARD_SWITCH ? 'base' : 'bonus';
    const L = this.layout[board];
    for (const k of ['grand', 'major', 'minor', 'mini'] as const) {
      const pl = L.plates[k];
      r.push({ x: pl.cx - 160, y: pl.cy - pl.height, w: 320, h: pl.height * 2, section: 'sec-game', field: `jackpot:${k}`, label: k.toUpperCase() });
    }
    r.push({ x: L.bet.cx - 150, y: L.bet.cy - 40, w: 150, h: 80, section: 'sec-game', field: 'bet:bet', label: 'Bet' });
    r.push({ x: L.balance.cx - 200, y: L.balance.cy - 50, w: 400, h: 100, section: 'sec-game', field: t < 1.17 ? 'balance:start' : 'balance:afterSpin', label: 'Balance' });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const key = board === 'base' && row === 0 && col === 2 && t < 1.0 ? 'coin-base:r0c2' : `coin:r${row}c${col}`;
        const isX = board === 'bonus' && row === 1 && col === 1 && t >= 24;
        const R = L.coinR;
        r.push({
          x: L.cells.x[col] - R, y: L.cells.y[row] - R, w: R * 2, h: R * 2, section: 'sec-game',
          field: isX ? 'multiplier' : key, label: isX ? 'Multiplier' : `Coin r${row + 1} c${col + 1}`,
        });
      }
    }
    if (L.totalBar && t >= 25.5) {
      const b = L.totalBar;
      r.push({ x: b.x, y: b.y, w: b.w, h: b.h, section: 'sec-game', field: 'coin:r0c0', label: 'Total = sum of coins' });
    }
    return r;
  }

  // ---------- interaction ----------

  private toStage(e: PointerEvent): { x: number; y: number } {
    const b = this.app.canvas.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * STAGE_W, y: ((e.clientY - b.top) / b.height) * STAGE_H };
  }

  private tap(e: PointerEvent): void {
    const p = this.toStage(e);
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const g = this.regions[i];
      if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h) {
        this.outline(g);
        this.onPick(g);
        return;
      }
    }
  }

  /** Outline the element a setting belongs to (hint = data-path or value key). */
  flash(hint: string): void {
    let found: Region[] = [];
    if (hint.startsWith('statusBar.')) found = this.regions.filter((r) => r.section === 'sec-status');
    else if (hint.startsWith('weather.')) found = this.regions.filter((r) => r.section === 'sec-weather');
    else if (hint.startsWith('push.')) found = this.regions.filter((r) => r.section === 'sec-push');
    else if (hint.startsWith('page.') || hint.startsWith('region.')) found = this.regions.filter((r) => r.field === hint || (r.section === 'sec-page' && r.field !== 'page.background'));
    else if (hint.startsWith('game.currency')) found = this.regions.filter((r) => r.field?.includes(':'));
    else found = this.regions.filter((r) => r.field === hint);
    for (const r of found) this.outline(r);
  }

  private outline(r: Region): void {
    const g = new Graphics()
      .roundRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 18)
      .stroke({ color: 0xffd23a, width: 8, alpha: 1 });
    this.overlay.addChild(g);
    let a = 1;
    const fade = () => {
      a -= 0.025;
      g.alpha = Math.max(0, a);
      if (a <= 0) {
        this.app.ticker.remove(fade);
        g.destroy();
      }
    };
    this.app.ticker.add(fade);
  }
}
