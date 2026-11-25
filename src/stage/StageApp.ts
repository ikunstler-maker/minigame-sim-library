import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { PT, STAGE_H, STAGE_W, type Preset } from '../config';
import type { AudioBus } from '../audio/AudioBus';
import { loadCatalog } from '../ios/iconCatalog';
import { GameStub } from './GameStub';
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
      this.scenes.addChild(home);
    }
    this.statusLayer.addChild(new StatusBar(this.preset.statusBar));
    return this.app.canvas;
  }

  /** iOS-style zoom from the tapped icon to a full-screen app window. */
  private async openApp(home: HomeScreen, req: OpenRequest): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const win = new Container();
    const content = new GameStub(req.slot.label, req.texture);
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
    this.busy = false;
  }

  /** Tear down the renderer and all scenes. */
  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
