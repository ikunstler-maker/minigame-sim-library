import { Assets, Container, Graphics, Rectangle, Sprite, Texture, Ticker, type FederatedPointerEvent } from 'pixi.js';
import type { AudioBus } from '../../audio/AudioBus';
import { STAGE_H, STAGE_W } from '../../config';
import type { GamePlugin } from '../_engine/GamePlugin';
import { PlateAudio } from '../coin-volcano-plate/PlateAudio';
import { PlateVideo } from '../coin-volcano-plate/PlateVideo';
import { formatMoney, loadGameFonts, makeNumber, setNumberText, type NumberKind } from '../coin-volcano-plate/numbers/numberStyles';
import { burst, fireColumn, fireTrail, flare, landingPop, punch, screenFlash, whirlSpin, type Effect } from './fx';
import {
  CELL_IDS, cellStateAt, insertAlpha, isSpin, lastAt, mergeLayout, parseCell, stepIndex,
  type BoardLayout, type CodeLayout, type CodeScript, type HoldDef, type Insert, type SymRef, type SymbolDef,
} from './script';
import { resolveValues } from './values';

/**
 * Coin Volcano built from elements ("code" variant): layer PNGs + symbol sprites +
 * numbers + FX, driven by script.json. Only the two splash sequences (bonus intro,
 * SIZZLING big win) are video inserts from plate.mp4. Design: design/stage3b-code-plan.md.
 *
 * The scene is a pure function of the scene clock `time` (reference seconds), so
 * `debugFreeze(t)` can show any moment. Clock source: the ticker outside inserts,
 * the video's currentTime inside them (no drift); holds stop the clock.
 *
 * State machine (explicit transitions):
 *   loading -> ready      load() resolved
 *   ready   -> playing    start()
 *   playing -> holding    clock reached the next hold
 *   holding -> playing    tap inside the hold's tap area / auto-continue
 *   playing -> blocked    an insert's video.play() was rejected (autoplay policy)
 *   blocked -> playing    any tap
 *   playing -> finished   clock reached script.duration -> onFinished()
 *   any     -> frozen     debugFreeze(t) (dev aid; taps ignored)
 */
export type CodeState = 'loading' | 'ready' | 'playing' | 'holding' | 'blocked' | 'frozen' | 'finished';

/** Money formatting for every number the game draws. */
export interface CurrencyFormat { thousands: string; decimal: string; decimals: number; prefix: string; suffix: string }

/** Construction options. */
export interface CodeGameOptions {
  /** Game media root ending with '/'. Default './private/coin-volcano/'. */
  baseUrl?: string;
  /** Route the soundtrack through this bus. Absent = silent. */
  audio?: AudioBus | null;
  /** Soundtrack URL; default baseUrl + script.media.audio. null = silent. */
  audioUrl?: string | null;
  /** Ticker to run on (default Ticker.shared). */
  ticker?: Ticker;
  /** Value overrides by key (see values.ts editableValues). */
  values?: Record<string, number>;
  /** Number format; default "25,000.00" style without prefix/suffix. */
  currency?: Partial<CurrencyFormat>;
  /** Leave each hold by itself after this many ms (a tap still works earlier). */
  autoContinueMs?: number;
  /** Video download progress 0..1. */
  onProgress?: (p: number) => void;
}

const DEFAULT_BASE = './private/coin-volcano/';
const DEFAULT_CURRENCY: CurrencyFormat = { thousands: ',', decimal: '.', decimals: 2, prefix: '', suffix: '' };
/** Symbols whose decorative strip copies carry a value (others have it baked into the art). */
const VALUED_SYMS = new Set(['gold', 'red']);
const PLATE_KEYS = ['grand', 'major', 'minor', 'mini'] as const;
/** Seconds before an insert at which the video is pre-seeked to its first frame. */
const PRESEEK_S = 1.5;
/** Audio drift that triggers a re-sync, seconds. */
const MAX_DRIFT_S = 0.1;

type BoardKey = 'base' | 'bonus';

function hash(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d);
  return (h ^ (h >>> 13)) >>> 0;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const gray = (b: number): number => {
  const c = Math.round(255 * clamp01(b));
  return (c << 16) | (c << 8) | c;
};
/** Shrink `node` uniformly so it is at most `maxW` wide (the free font is wider than the game's). */
function fitWidth(node: Container, maxW: number): void {
  node.scale.set(1);
  const w = node.width;
  if (w > maxW && w > 0) node.scale.set(maxW / w);
}
const parseColor = (s: string | undefined, d: number): number => (s ? Number(s) || d : d);

/** A coin/whirl/mystery: art sprite (inside `spinner`, the whirlSpin target) + value text. */
class SymbolNode extends Container {
  readonly spinner = new Container();
  private readonly glow = new Sprite(Texture.EMPTY);
  private readonly sprite = new Sprite(Texture.EMPTY);
  private readonly fallback = new Graphics();
  private readonly numbers = new Map<string, Container>();
  private curSym = '';
  private curR = 0;
  private texts = new Map<string, string>();

  constructor(private readonly game: CodeGame) {
    super();
    this.sprite.anchor.set(0.5);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.spinner.addChild(this.fallback, this.sprite);
    this.addChild(this.glow, this.spinner);
  }

  /** Show `sym` drawn at radius `r` with `text` (null = no text). */
  show(sym: string | null, r: number, text: string | null): void {
    this.visible = !!sym;
    if (!sym) return;
    const def = this.game.symbolDef(sym);
    const drawR = def?.drawR ?? r;
    if (sym !== this.curSym || drawR !== this.curR) {
      this.curSym = sym;
      this.curR = drawR;
      const tex = this.game.symbolTexture(sym);
      const g = this.game.glowFor(sym);
      this.glow.visible = !!g;
      if (g) {
        this.glow.texture = g.tex;
        this.glow.width = this.glow.height = drawR * 2 * g.scale;
        this.glow.alpha = g.alpha;
      }
      this.sprite.visible = !!tex;
      this.fallback.clear();
      if (tex) {
        this.sprite.texture = tex;
        this.sprite.scale.set(drawR / (def?.artR ?? tex.width / 2));
      } else {
        this.fallback.circle(0, 0, drawR).fill({ color: parseColor(def?.fallback, 0xf2b322) })
          .circle(0, 0, drawR).stroke({ width: 8, color: 0xffe9a0 });
      }
    }
    const kind = (def?.text ?? 'coin') as NumberKind;
    for (const [k, n] of this.numbers) n.visible = k === kind && text !== null;
    if (text === null) return;
    let n = this.numbers.get(kind);
    if (!n) {
      n = makeNumber(kind, text, this.game.textHeight(kind));
      this.numbers.set(kind, n);
      this.addChild(n);
      this.texts.set(kind, text);
    } else if (this.texts.get(kind) !== text) {
      setNumberText(n, text);
      this.texts.set(kind, text);
    } else {
      n.visible = true;
      return;
    }
    n.visible = true;
    fitWidth(n, 2 * drawR * this.game.coinTextFrac);
  }
}

/** One board cell: resting symbol, masked reel strip and anticipation frame. */
class CellView extends Container {
  readonly rest: SymbolNode;
  readonly strip = new Container();
  readonly items: SymbolNode[];
  readonly mask = new Graphics();
  readonly antic = new Graphics();
  pitch = { x: 0, y: 0 };

  constructor(game: CodeGame) {
    super();
    this.rest = new SymbolNode(game);
    this.items = [new SymbolNode(game), new SymbolNode(game), new SymbolNode(game)];
    this.strip.addChild(...this.items, this.mask);
    this.strip.mask = this.mask;
    this.addChild(this.strip, this.rest, this.antic);
  }

  setPitch(px: number, py: number): void {
    if (px === this.pitch.x && py === this.pitch.y) return;
    this.pitch = { x: px, y: py };
    this.mask.clear().rect(-px / 2, -py / 2, px, py).fill(0xffffff);
  }
}

/** The Coin Volcano "code" take. See `GamePlugin` for the lifecycle. */
export class CodeGame extends Container implements GamePlugin {
  /** Fired once when the take ends. */
  onFinished: () => void = () => {};

  private readonly opts: CodeGameOptions;
  private readonly base: string;
  private readonly cur: CurrencyFormat;
  private script!: CodeScript;
  private layout!: CodeLayout;
  private values: Record<string, number> = {};
  private video: PlateVideo | null = null;
  private sound: PlateAudio | null = null;
  private textures = new Map<string, Texture | null>();
  private fxList: Effect[] = [];

  // display tree
  private readonly bg = { base: new Container(), bonus: new Container() };
  private readonly ui = { base: new Container(), bonus: new Container() };
  private readonly cellsLayer = new Container({ label: 'cells' });
  private readonly fxLayer = new Container({ label: 'fx' });
  private readonly multLayer = new Container({ label: 'multiplier' });
  private readonly barLayer = new Container({ label: 'total-bar' });
  private readonly flashLayer = new Container({ label: 'flash' });
  private readonly videoSprite = new Sprite(Texture.EMPTY);
  private readonly topLayer = new Container({ label: 'top' });
  private cells = new Map<string, CellView>();
  private spinBtn: Record<BoardKey, Container | null> = { base: null, bonus: null };
  private spinCounter: Container | null = null;
  private pipOffs: Container[] = [];
  private barText: Container | null = null;
  private multNode: Container | null = null;
  private bigWinRoot = new Container();
  private bigWinText: Container | null = null;
  private balanceText: Container | null = null;
  private readonly balanceBacking = new Graphics();
  private readonly textCache = new Map<Container, string>();

  // clock
  private clock = 0;
  private _state: CodeState = 'loading';
  private nextHold = 0;
  private activeHold: HoldDef | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private videoStarting = false;
  private preseekFor: Insert | null = null;
  private ticker: Ticker | null = null;
  private lastDriftCheck = 0;

  constructor(opts: CodeGameOptions = {}) {
    super({ label: 'coin-volcano-code' });
    this.opts = opts;
    this.base = opts.baseUrl ?? DEFAULT_BASE;
    this.cur = { ...DEFAULT_CURRENCY, ...opts.currency };
    this.videoSprite.visible = false;
    this.addChild(
      this.bg.base, this.bg.bonus, this.ui.base, this.ui.bonus, this.cellsLayer, this.fxLayer,
      this.multLayer, this.barLayer, this.flashLayer, this.videoSprite, this.topLayer,
    );
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, STAGE_W, STAGE_H);
    this.on('pointertap', this.onTap, this);
  }

  /** Current state of the state machine. */
  get state(): CodeState {
    return this._state;
  }

  /** Scene clock in reference seconds. */
  get time(): number {
    return this.clock;
  }

  /** Resolved values (configured + derived), after load. */
  get resolvedValues(): Readonly<Record<string, number>> {
    return this.values;
  }

  /** Load script, layout, textures, fonts, video and soundtrack. */
  async load(): Promise<void> {
    const scriptUrl = this.base + 'code/script.json';
    const res = await fetch(scriptUrl);
    if (!res.ok) throw new Error(`code script missing: ${scriptUrl} (${res.status})`);
    this.script = (await res.json()) as CodeScript;
    const s = this.script;
    this.values = resolveValues(s, this.opts.values);

    this.video = new PlateVideo(this.base + s.media.video, this.opts.onProgress);
    const audioUrl = this.opts.audioUrl === undefined ? this.base + s.media.audio : this.opts.audioUrl;
    this.sound = new PlateAudio(this.opts.audio ?? null, audioUrl);
    this.videoSprite.texture = this.video.texture;
    // size after the texture swap: setSize on the 1x1 EMPTY texture would scale by 1080
    this.videoSprite.setSize(STAGE_W, STAGE_H);

    const files = [
      ...Object.values(s.media.layers),
      ...Object.values(s.symbols).map((d) => d.file),
      ...(s.media.bigWinLabel ? [s.media.bigWinLabel] : []),
    ];
    await Promise.all([
      loadGameFonts().catch((e) => console.warn('[code] font unavailable:', e)),
      this.fetchLayout(),
      ...files.map((f) => this.loadTexture(f)),
      this.video.load(),
      this.sound.load(),
    ]);
    this.buildScene();
    this.buildEffects();
    this.render(0);
    this._state = 'ready';
    this.ticker = this.opts.ticker ?? Ticker.shared;
    this.ticker.add(this.onTick, this);
  }

  /** Begin the take from 0. */
  start(): void {
    if (this._state !== 'ready') return;
    this.clock = 0;
    this.nextHold = 0;
    this._state = 'playing';
    void this.opts.audio?.resume().catch(() => undefined);
    this.sound?.startAt(0);
  }

  /** Dev aid: stop and show the scene at `t` seconds (video inserts seek too). */
  async debugFreeze(t: number): Promise<void> {
    this._state = 'frozen';
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    this.sound?.stop();
    this.video?.pause();
    this.clock = t;
    if (this.video && this.script.inserts.some((i) => insertAlpha(i, t) > 0)) await this.video.seek(t);
    this.render(t);
  }

  /** Per-frame step (ms); attached to the ticker by load(). */
  update(dtMs: number): void {
    if (!this.video) return;
    this.video.tick();
    if (this._state === 'playing') this.advance(dtMs / 1000);
    this.render(this.clock);
  }

  /** Stop everything and free resources. */
  override destroy(): void {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.ticker?.remove(this.onTick, this);
    this.ticker = null;
    for (const e of this.fxList) e.destroy();
    this.fxList = [];
    this.sound?.destroy();
    this.video?.destroy();
    this.glowTex?.destroy(true);
    super.destroy({ children: true });
  }

  // ---------------------------------------------------------------- helpers used by nodes

  /** @internal */
  symbolDef(sym: string): SymbolDef | undefined {
    return this.script.symbols[sym];
  }

  /** @internal */
  symbolTexture(sym: string): Texture | null {
    const d = this.script.symbols[sym];
    return d ? this.textures.get(d.file) ?? null : null;
  }

  private glowTex: Texture | null = null;

  /** @internal Soft additive halo behind value coins (reference coins glow); null = none. */
  glowFor(sym: string): { tex: Texture; scale: number; alpha: number } | null {
    const gcfg = this.script.glow;
    if (!gcfg || !gcfg.symbols.includes(sym)) return null;
    if (!this.glowTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d')!;
      const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,220,90,1)');
      gr.addColorStop(0.62, 'rgba(255,200,60,0.9)');
      gr.addColorStop(0.8, 'rgba(255,150,20,0.35)');
      gr.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 256, 256);
      this.glowTex = Texture.from(c);
    }
    return { tex: this.glowTex, scale: gcfg.scale, alpha: gcfg.alpha };
  }

  /** @internal Max coin text width as a fraction of the coin diameter. */
  get coinTextFrac(): number {
    return this.script.text.fit?.coinFrac ?? 0.82;
  }

  /** @internal Digit height for a symbol text kind. */
  textHeight(kind: NumberKind): number {
    return kind === 'whirl' ? this.script.text.whirlHeight : this.script.text.coinHeight;
  }

  // ---------------------------------------------------------------- loading

  private async fetchLayout(): Promise<void> {
    let raw: unknown = null;
    try {
      const r = await fetch(this.base + this.script.media.layout);
      if (r.ok) raw = await r.json(); // Vite answers missing files with index.html: json() throws
    } catch {
      raw = null;
    }
    if (!raw) console.warn('[code] layout.json missing, using fallback geometry');
    this.layout = mergeLayout(raw);
  }

  private async loadTexture(file: string): Promise<void> {
    try {
      this.textures.set(file, await Assets.load<Texture>(this.base + file));
    } catch {
      console.warn('[code] missing layer, placeholder used:', file);
      this.textures.set(file, null);
    }
  }

  private tex(layer: keyof CodeScript['media']['layers']): Texture | null {
    return this.textures.get(this.script.media.layers[layer]) ?? null;
  }

  private fmt(key: string): string {
    const v = this.values[key] ?? 0;
    return this.cur.prefix + formatMoney(v, this.cur) + this.cur.suffix;
  }

  private setText(node: Container, text: string): void {
    if (this.textCache.get(node) === text) return;
    this.textCache.set(node, text);
    setNumberText(node, text);
  }

  private num(kind: NumberKind, text: string, p: { cx: number; cy: number; height: number }, parent: Container, maxW?: number): Container {
    const n = makeNumber(kind, text, p.height);
    if (maxW) fitWidth(n, maxW);
    n.position.set(p.cx, p.cy);
    this.textCache.set(n, text);
    parent.addChild(n);
    return n;
  }

  /**
   * Place a layer sprite. Full-stage layers (1080x2340) sit at 0,0; cropped ones are
   * centred on `c` (or fitted into `rect`).
   */
  private layerSprite(tex: Texture, c: { x: number; y: number }, rect?: { x: number; y: number; w: number; h: number }): Sprite {
    const sp = new Sprite(tex);
    if (tex.width === STAGE_W && tex.height === STAGE_H) {
      sp.pivot.set(c.x, c.y);
      sp.position.set(c.x, c.y);
    } else if (rect) {
      sp.anchor.set(0.5);
      sp.setSize(rect.w, rect.h);
      sp.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    } else {
      sp.anchor.set(0.5);
      sp.position.set(c.x, c.y);
    }
    return sp;
  }

  // ---------------------------------------------------------------- scene build

  private buildScene(): void {
    const s = this.script;
    const fit = s.text.fit;
    for (const b of ['base', 'bonus'] as const) {
      const L = this.layout[b];
      const bgTex = this.tex(b === 'base' ? 'bgBase' : 'bgBonus');
      if (bgTex) {
        const sp = new Sprite(bgTex);
        sp.setSize(STAGE_W, STAGE_H);
        this.bg[b].addChild(sp);
      } else {
        this.bg[b].addChild(this.placeholderBoard(b, L));
      }
      const ui = this.ui[b];
      for (const k of PLATE_KEYS) {
        this.num(k === 'grand' ? 'plate' : 'plateLight', this.fmt(`jackpot:${k}`), L.plates[k], ui, fit?.plate);
      }
      this.num('ui', this.fmt('bet:bet'), L.bet, ui, fit?.bet);
      const spinTex = this.tex(b === 'base' ? 'spinButton' : 'spinButtonBonus');
      const sc = { x: L.spin.cx, y: L.spin.cy };
      if (spinTex) {
        const sp = this.layerSprite(spinTex, sc);
        ui.addChild(sp);
        this.spinBtn[b] = sp;
      } else {
        const g = new Graphics().circle(0, 0, L.spin.r).fill({ color: 0x3a1020 })
          .circle(0, 0, L.spin.r).stroke({ width: 8, color: 0xffd060 })
          .moveTo(0, -L.spin.r * 0.6).lineTo(L.spin.r * 0.3, -L.spin.r * 0.35).stroke({ width: 10, color: 0xffd060 });
        g.position.set(sc.x, sc.y);
        ui.addChild(g);
        this.spinBtn[b] = g;
      }
    }

    // bonus extras: pips, respin counter
    const BL = this.layout.bonus;
    if (BL.pips) {
      const pipsTex = this.tex('pips');
      const p = BL.pips;
      if (pipsTex) this.ui.bonus.addChild(this.layerSprite(pipsTex, { x: p.x + p.w / 2, y: p.y + p.h / 2 }, pipsTex.width === STAGE_W ? undefined : p));
      else this.ui.bonus.addChild(new Graphics().roundRect(p.x, p.y, p.w, p.h, 8).fill({ color: 0x5a0a08 }).stroke({ width: 4, color: 0xffb040 }));
      const offTex = this.tex('pipOff');
      const n = s.boards.bonus.pips?.count ?? 3;
      for (let i = 0; i < n; i++) {
        const cx = p.x + ((i + 0.5) * p.w) / n;
        let node: Container;
        if (offTex) {
          const sp = new Sprite(offTex);
          sp.anchor.set(0.5);
          node = sp;
        } else {
          node = new Graphics().roundRect(-p.w / n / 2 + 4, -p.h / 2 + 4, p.w / n - 8, p.h - 8, 8).fill({ color: 0x1a0402, alpha: 0.85 });
        }
        node.position.set(cx, p.y + p.h / 2);
        this.ui.bonus.addChild(node);
        this.pipOffs.push(node);
      }
    }
    this.spinCounter = this.num(s.text.spinCounterKind as NumberKind, '3',
      { cx: BL.spin.cx, cy: BL.spin.cy, height: s.text.spinCounterHeight }, this.ui.bonus);

    // cells
    for (const id of CELL_IDS) {
      const c = new CellView(this);
      this.cells.set(id, c);
      this.cellsLayer.addChild(c);
    }

    // multiplier
    const m = s.multiplier;
    const mText = s.text.multiplierTemplate.replace('{n}', String(this.values[m.value] ?? 0));
    const mp = this.cellPos('bonus', m.cell);
    this.multNode = this.num(s.text.multiplierKind as NumberKind, mText, { cx: mp.x, cy: mp.y, height: s.text.multiplierHeight }, this.multLayer);

    // total bar
    const tb = BL.totalBar ?? { x: 335, y: 1416, w: 425, h: 78, textCx: 544.5, textCy: 1454, textHeight: 48 };
    const barTex = this.tex('totalBar');
    if (barTex) this.barLayer.addChild(this.layerSprite(barTex, { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }, barTex.width === STAGE_W ? undefined : tb));
    else this.barLayer.addChild(new Graphics().roundRect(tb.x, tb.y, tb.w, tb.h, 14).fill({ color: 0x5a0a08 }).stroke({ width: 5, color: 0xffc040 }));
    // sized once for the widest (final) total so landingPop's captured base scale stays valid
    this.barText = this.num('counter', this.fmt('total'), { cx: tb.textCx, cy: tb.textCy, height: tb.textHeight }, this.barLayer, tb.w * (fit?.barFrac ?? 0.8));

    // big win (above the video)
    const bw = s.bigWin;
    const labelTex = s.media.bigWinLabel ? this.textures.get(s.media.bigWinLabel) ?? null : null;
    if (labelTex) {
      const sp = new Sprite(labelTex);
      sp.position.set(bw.label.x, bw.label.y);
      sp.setSize(bw.label.w, bw.label.h);
      this.bigWinRoot.addChild(sp);
    } else {
      this.bigWinRoot.addChild(new Graphics().roundRect(bw.label.x, bw.label.y + bw.label.h * 0.2, bw.label.w, bw.label.h * 0.6, 40)
        .fill({ color: 0x4a0804, alpha: 0.75 }));
    }
    this.bigWinText = this.num('bigwin', this.fmt('bigwin'), { cx: bw.cx, cy: bw.cy, height: bw.height }, this.bigWinRoot, bw.label.w * (fit?.bigWinFrac ?? 0.86));
    const balP = this.layout.base.balance;
    const bb = s.balanceBacking;
    this.balanceBacking.rect(balP.cx - bb.w / 2, balP.cy - bb.h / 2, bb.w, bb.h).fill({ color: parseColor(bb.color, 0) });
    this.topLayer.addChild(this.bigWinRoot, this.balanceBacking);
    this.balanceText = this.num('ui', this.fmt('balance:final'), balP, this.topLayer, fit?.balance);
  }

  private placeholderBoard(b: BoardKey, L: BoardLayout): Container {
    const g = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill({ color: b === 'base' ? 0x3b1450 : 0x8a1408 });
    const px = L.cells.x[1] - L.cells.x[0];
    const py = L.cells.y[1] - L.cells.y[0];
    for (const x of L.cells.x) for (const y of L.cells.y) {
      g.rect(x - px / 2, y - py / 2, px, py).fill({ color: 0x000000, alpha: 0.25 }).stroke({ width: 3, color: 0xffa040 });
    }
    for (const k of PLATE_KEYS) {
      const p = L.plates[k];
      g.roundRect(p.cx - 150, p.cy - p.height, 300, p.height * 2, 16).fill({ color: 0x20103a });
    }
    return g;
  }

  private cellPos(b: BoardKey, id: string): { x: number; y: number } {
    const [r, c] = parseCell(id);
    const L = this.layout[b];
    return { x: L.cells.x[c], y: L.cells.y[r] };
  }

  // ---------------------------------------------------------------- effects (all keyed on scene time)

  private buildEffects(): void {
    const s = this.script;
    const fx = this.fxList;
    const BL = this.layout.bonus;
    for (const b of ['base', 'bonus'] as const) {
      const board = s.boards[b];
      for (const [id, events] of Object.entries(board.cells)) {
        const cell = this.cells.get(id);
        if (!cell) continue;
        for (const e of events) {
          if (!isSpin(e) || !e.land) continue;
          fx.push(landingPop(cell.rest, e.spin[1], 0.3));
          if (b === 'bonus') fx.push(burst(this.fxLayer, this.cellPos(b, id), e.spin[1], { radius: 120 }));
        }
      }
      if (board.trigger) {
        for (const id of board.trigger.cells) {
          fx.push(flare(this.fxLayer, this.cellPos(b, id), this.layout[b].coinR, board.trigger.t0, board.trigger.dur));
        }
      }
    }
    // whirl
    const w = s.whirl;
    const wc = this.cells.get(w.cell)!;
    const wp = this.cellPos('bonus', w.cell);
    fx.push(flare(this.fxLayer, wp, 150, w.activate.t, w.activate.dur, { pulses: 1 }));
    fx.push(whirlSpin(wc.rest.spinner, w.activate.t));
    w.collect.forEach((c, i) => {
      fx.push(fireTrail(this.fxLayer, this.cellPos('bonus', c.from), wp, c.t - w.trailDur, w.trailDur, { arc: i % 2 ? -0.35 : 0.35 }));
      fx.push(landingPop(wc.rest, c.t, 0.3));
    });
    // multiplier
    const m = s.multiplier;
    fx.push(burst(this.fxLayer, this.cellPos('bonus', m.cell), m.burst, { radius: 220, count: 26 }));
    fx.push(screenFlash(this.flashLayer, m.flash.t, m.flash.dur));
    if (this.multNode) fx.push(punch(this.multNode, m.t, m.settle - m.t, 2.4, 1));
    // collect into the total bar
    const tb = BL.totalBar ?? { textCx: 544.5, textCy: 1454 };
    const barP = { x: tb.textCx, y: tb.textCy };
    for (const c of s.collect.order) {
      fx.push(fireColumn(this.fxLayer, this.cellPos('bonus', c.cell), barP, c.t - s.collect.trailDur, s.collect.trailDur));
      if (this.barText) fx.push(landingPop(this.barText, c.t, 0.25));
    }
  }

  // ---------------------------------------------------------------- render(t)

  private render(t: number): void {
    const s = this.script;
    const b: BoardKey = t < s.boardSwitch ? 'base' : 'bonus';
    const L = this.layout[b];
    const board = s.boards[b];
    this.bg.base.visible = this.ui.base.visible = b === 'base';
    this.bg.bonus.visible = this.ui.bonus.visible = b === 'bonus';

    // spin button rotation (2 turns per second while a spin runs)
    const btn = this.spinBtn[b];
    if (btn) {
      let spun = 0;
      for (const [a, z] of board.spinButtonRotate ?? []) spun += Math.max(0, Math.min(t, z) - a);
      btn.rotation = spun * Math.PI * 4;
    }
    // respin counter + pips
    if (b === 'bonus') {
      const n = lastAt(board.respinCounter ?? [], t)?.n ?? 0;
      if (this.spinCounter) this.setText(this.spinCounter, String(n));
      // pips: the strip shows every pip lit; used respins (index >= left) are covered by the dark pip
      this.pipOffs.forEach((node, i) => { node.visible = i >= n; });
    }

    // brightness: global dim ramps
    let glob = 1;
    for (const d of s.dim.global) {
      if (t >= d.t1) glob = d.to;
      else if (t > d.t0) glob = glob + (d.to - glob) * ((t - d.t0) / (d.t1 - d.t0));
    }
    if (b === 'base') glob = 1;

    // cells
    const px = L.cells.x[1] - L.cells.x[0];
    const py = L.cells.y[1] - L.cells.y[0];
    const m = s.multiplier;
    CELL_IDS.forEach((id, ci) => {
      const cell = this.cells.get(id)!;
      const p = this.cellPos(b, id);
      cell.position.set(p.x, p.y);
      cell.setPitch(px, py);
      cell.rest.scale.set(1);
      cell.rest.spinner.rotation = 0;
      cell.rest.spinner.scale.set(1);
      const events = board.cells[id] ?? [];
      const st = cellStateAt(events, t, s.strip.speed);
      if (st.kind === 'rest') {
        cell.strip.visible = false;
        let dy = 0;
        if (st.landT !== null && t - st.landT < s.bounce.dur) {
          const k = (t - st.landT) / s.bounce.dur;
          dy = s.bounce.amp * Math.sin(Math.PI * k) * (1 - k);
        }
        cell.rest.y = dy;
        cell.rest.show(st.sym?.sym ?? null, L.coinR, this.symText(st.sym, t));
        if (b === 'bonus' && id === m.cell && t >= m.t && m.hideCoinValue) cell.rest.visible = false;
      } else {
        cell.rest.visible = false;
        cell.strip.visible = true;
        cell.items.forEach((node, i) => {
          const it = st.items[i];
          if (!it) { node.visible = false; return; }
          node.y = it.dy * py;
          if (it.filler >= 0) {
            const syms = s.strip.symbols;
            const sym = syms[hash(ci, it.filler) % syms.length];
            const mults = s.strip.betMultiples;
            const val = (this.values['bet:bet'] ?? 0) * mults[hash(it.filler, ci + 17) % mults.length];
            node.show(sym, L.coinR, VALUED_SYMS.has(sym) ? this.cur.prefix + formatMoney(val, this.cur) + this.cur.suffix : null);
          } else {
            node.show(it.sym?.sym ?? null, L.coinR, this.symText(it.sym, t));
          }
        });
      }
      // dimming
      let bright = glob;
      const col = s.collect.order.find((c) => c.cell === id);
      if (b === 'bonus' && col && t >= col.t) bright *= 1 - (1 - s.dim.collected) * clamp01((t - col.t) / s.dim.collectedFade);
      cell.tint = gray(bright);
      // anticipation frame
      const an = (board.anticipation ?? []).find((a) => a.cell === id && t >= a.t0 && t < a.t1);
      cell.antic.clear();
      if (an) this.drawAnticipation(cell.antic, px, py, t - an.t0);
    });

    // multiplier
    if (this.multNode) this.multNode.visible = b === 'bonus' && t >= m.t;

    // total bar
    const bar = s.collect.bar;
    const barA = t < bar.t0 || t > bar.t1 ? 0 : Math.min(clamp01((t - bar.t0) / bar.fade), clamp01((bar.t1 - t) / bar.fade));
    this.barLayer.visible = b === 'bonus' && barA > 0;
    this.barLayer.alpha = barA;
    if (this.barText) {
      const i = stepIndex(s.collect.order, t);
      this.barText.visible = i >= 0;
      if (i >= 0) this.setText(this.barText, this.fmt(`total:step${i}`));
    }

    // video inserts
    let va = 0;
    for (const ins of s.inserts) va = Math.max(va, insertAlpha(ins, t));
    this.videoSprite.visible = va > 0 && !!this.video?.hasFrame;
    this.videoSprite.alpha = va;

    // big win
    const bw = s.bigWin;
    const bwA = t < bw.t0 || t > bw.t1 ? 0 : Math.min(clamp01((t - bw.t0) / bw.fade), bw.t1 - t >= bw.fade ? 1 : clamp01((bw.t1 - t) / bw.fade + 1e-9));
    this.bigWinRoot.visible = bwA > 0;
    this.bigWinRoot.alpha = bwA;
    if (this.bigWinText && bwA > 0) {
      const from = this.values['bigwin:from'] ?? 0;
      const to = this.values.bigwin ?? 0;
      const k = clamp01((t - bw.countT0) / (bw.countT1 - bw.countT0));
      const v = Math.round((from + (to - from) * k) * 100) / 100;
      this.setText(this.bigWinText, this.cur.prefix + formatMoney(v, this.cur) + this.cur.suffix);
    }

    // balance (always on top; backed while a video insert shows the reference digits)
    const balKey = lastAt(s.balance, t)?.value ?? 'balance:start';
    if (this.balanceText) {
      this.setText(this.balanceText, this.fmt(balKey));
      this.balanceText.position.set(L.balance.cx, L.balance.cy);
    }
    this.balanceBacking.visible = va > 0;
    this.balanceBacking.alpha = va;

    for (const e of this.fxList) e.update(t);
  }

  private symText(sym: SymRef | null, t: number): string | null {
    if (!sym?.value) return null;
    if (sym.value === 'whirl') {
      const i = stepIndex(this.script.whirl.collect, t);
      return i >= 0 ? this.fmt(`whirl:step${i}`) : null;
    }
    return this.fmt(sym.value);
  }

  private drawAnticipation(g: Graphics, px: number, py: number, lt: number): void {
    const fl = 0.75 + 0.25 * Math.sin(lt * 23) * Math.sin(lt * 9.7 + 1.3);
    const w = px - 14;
    const h = py - 14;
    g.blendMode = 'add';
    g.rect(-w / 2, -h / 2, w, h).fill({ color: 0x501000, alpha: 0.9 });
    for (let i = 0; i < 7; i++) {
      const fx = -w / 2 + ((i + 0.5) * w) / 7;
      const fh = h * (0.35 + 0.2 * Math.sin(lt * (7 + i) + i * 1.7));
      g.ellipse(fx, h / 2 - fh / 2, w / 11, fh / 2).fill({ color: 0xff5a00, alpha: 0.7 * fl });
      g.ellipse(fx, h / 2 - fh / 3, w / 22, fh / 3).fill({ color: 0xffc040, alpha: 0.6 * fl });
    }
    g.roundRect(-w / 2, -h / 2, w, h, 10).stroke({ width: 14, color: 0xff5a00, alpha: 0.55 * fl });
    g.roundRect(-w / 2, -h / 2, w, h, 10).stroke({ width: 5, color: 0xffe08a, alpha: fl });
  }

  // ---------------------------------------------------------------- clock

  private onTick(tk: Ticker): void {
    this.update(tk.deltaMS);
  }

  private activeInsert(t: number): Insert | null {
    return this.script.inserts.find((i) => t >= i.t0 && t < i.t1 + i.fadeOut) ?? null;
  }

  private advance(dt: number): void {
    const s = this.script;
    const v = this.video!;
    const prev = this.clock;
    if (this.activeInsert(prev)) {
      if (v.paused) {
        if (!this.videoStarting) this.startVideo();
      } else if (!this.videoStarting) {
        this.clock = v.video.ended ? s.duration : Math.max(prev, v.time);
      }
    } else {
      if (!v.paused) v.pause();
      this.clock = prev + Math.min(dt, 0.25);
      const entered = s.inserts.find((i) => i.t0 > prev && i.t0 <= this.clock);
      if (entered) this.clock = entered.t0;
      const next = s.inserts.find((i) => i.t0 > this.clock && i.t0 - this.clock < PRESEEK_S);
      if (next && this.preseekFor !== next && !this.videoStarting) {
        this.preseekFor = next;
        void v.seek(next.t0);
      }
    }
    const h = s.holds[this.nextHold];
    if (h && this.clock >= h.t) {
      this.clock = h.t;
      this.enterHold(h);
      return;
    }
    if (this.clock >= s.duration - 1e-3) {
      this.clock = s.duration;
      this.finish();
      return;
    }
    this.checkDrift();
  }

  private startVideo(): void {
    const v = this.video!;
    this.videoStarting = true;
    this.sound?.stop();
    void (async () => {
      try {
        if (Math.abs(v.time - this.clock) > 0.04) await v.seek(this.clock);
        if (this._state !== 'playing') return;
        await v.play();
        if (this._state === 'playing') this.sound?.startAt(this.clock);
        else v.pause();
      } catch (e) {
        console.warn('[code] video play() rejected, waiting for a tap:', e);
        if (this._state === 'playing') this._state = 'blocked';
      } finally {
        this.videoStarting = false;
      }
    })();
  }

  private checkDrift(): void {
    const bus = this.opts.audio;
    const snd = this.sound;
    if (!bus || !snd?.ready || bus.ctx.state !== 'running' || this.videoStarting) return;
    if (!snd.playing) {
      const now = performance.now();
      if (now - this.lastDriftCheck < 500) return;
      this.lastDriftCheck = now;
      snd.startAt(this.clock);
      return;
    }
    const now = performance.now();
    if (now - this.lastDriftCheck < 500) return;
    this.lastDriftCheck = now;
    if (Math.abs(snd.position - this.clock) > MAX_DRIFT_S) snd.startAt(this.clock);
  }

  private enterHold(h: HoldDef): void {
    this._state = 'holding';
    this.activeHold = h;
    this.sound?.stop();
    const v = this.video!;
    v.pause();
    if (this.activeInsert(h.t)) void v.seek(h.t);
    const wait = this.opts.autoContinueMs;
    if (wait !== undefined && wait >= 0) this.autoTimer = setTimeout(() => this.release(), wait);
  }

  private release(): void {
    if (this._state !== 'holding' || !this.activeHold) return;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    this.activeHold = null;
    this.nextHold++;
    this._state = 'playing';
    if (this.activeInsert(this.clock)) this.startVideo();
    else this.sound?.startAt(this.clock);
  }

  private onTap(e: FederatedPointerEvent): void {
    void this.opts.audio?.resume().catch(() => undefined);
    if (this._state === 'blocked') {
      this._state = 'playing';
      this.startVideo();
      return;
    }
    if (this._state !== 'holding' || !this.activeHold) return;
    const h = this.activeHold;
    if (h.tap === 'spin') {
      const p = this.toLocal(e.global);
      const sp = this.layout[h.t < this.script.boardSwitch ? 'base' : 'bonus'].spin;
      if (Math.hypot(p.x - sp.cx, p.y - sp.cy) > sp.r * 1.15) return;
    }
    this.release();
  }

  private finish(): void {
    if (this._state === 'finished') return;
    this._state = 'finished';
    this.video?.pause();
    this.sound?.stop();
    this.onFinished();
  }
}
