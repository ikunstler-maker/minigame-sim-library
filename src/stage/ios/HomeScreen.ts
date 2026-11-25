import { BlurFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, PT, STAGE_H, STAGE_W, type IconSlot, type Preset } from '../../config';
import { slotUrl, type CatalogIcon } from '../../ios/iconCatalog';
import { loadTexture } from '../textures';
import { IOS_FONT } from './StatusBar';
import { WIDGET_H, WIDGET_W, WeatherWidget } from './WeatherWidget';

/** Home-screen geometry in stage pixels. */
export const ICON = 64 * PT;
const GRID_LEFT = (STAGE_W - WIDGET_W) / 2;
const COL_PITCH = (WIDGET_W - ICON) / (GRID_COLS - 1);
const ROW_PITCH = WIDGET_H - ICON; // two rows span exactly one medium widget
const GRID_TOP = 74 * PT;
const DOCK_H = 92 * PT;
const DOCK_MARGIN = 10 * PT;
const DOCK_Y = STAGE_H - DOCK_MARGIN - DOCK_H - 8 * PT;
const ICON_RADIUS = ICON * 0.225;

/** Top-left of a grid cell's icon. */
export function cellPos(index: number): { x: number; y: number } {
  const col = index % GRID_COLS, row = Math.floor(index / GRID_COLS);
  return { x: GRID_LEFT + col * COL_PITCH, y: GRID_TOP + row * ROW_PITCH };
}

export interface OpenRequest {
  slot: IconSlot;
  /** Icon rectangle in stage coordinates. */
  x: number;
  y: number;
  size: number;
  texture: Texture | null;
}

/** Scale a sprite so it covers the whole stage. */
function cover(s: Sprite): void {
  const k = Math.max(STAGE_W / s.texture.width, STAGE_H / s.texture.height);
  s.scale.set(k);
  s.anchor.set(0.5);
  s.position.set(STAGE_W / 2, STAGE_H / 2);
}

/**
 * iOS home screen: wallpaper, weather widget, 4x6 icon grid, glass dock, search pill.
 * Tapping a 'game' icon calls `onOpen`.
 */
export class HomeScreen extends Container {
  onOpen: (req: OpenRequest) => void = () => {};
  private gameIcon: Container | null = null;
  private progress: Graphics | null = null;

  /**
   * iOS-style download pie over the game icon while the game loads (0..1).
   * Removed at 1, so a take recorded after loading shows a clean icon.
   */
  setGameProgress(p: number): void {
    if (!this.gameIcon) return;
    if (p >= 1) {
      this.progress?.destroy();
      this.progress = null;
      return;
    }
    if (!this.progress) {
      this.progress = new Graphics();
      this.gameIcon.addChild(this.progress);
    }
    const c = ICON / 2, r = ICON * 0.24;
    const a0 = -Math.PI / 2;
    this.progress
      .clear()
      .roundRect(0, 0, ICON, ICON, ICON_RADIUS)
      .fill({ color: 0x000000, alpha: 0.45 })
      .circle(c, c, r)
      .stroke({ color: 0xffffff, width: 2.2 * PT, alpha: 0.95 })
      .moveTo(c, c)
      .arc(c, c, r - 3.5 * PT, a0, a0 + Math.PI * 2 * Math.max(0.001, p))
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.95 });
  }

  private constructor() {
    super();
  }

  /** Build the screen; waits for all textures so the first recorded frame is complete. */
  static async create(p: Preset, catalog: CatalogIcon[]): Promise<HomeScreen> {
    const h = new HomeScreen();
    await h.build(p, catalog);
    return h;
  }

  private async build(p: Preset, catalog: CatalogIcon[]): Promise<void> {
    const wallTex = await loadTexture(p.home.wallpaper);
    const wall = wallTex ? new Sprite(wallTex) : null;
    if (wall) {
      cover(wall);
      this.addChild(wall);
    } else {
      this.addChild(new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(0x3a4a63));
    }

    // Widget
    const widgetRows = new Set<number>();
    if (p.weather.enabled) {
      const row = Math.max(0, Math.min(GRID_ROWS - 2, p.weather.row));
      widgetRows.add(row).add(row + 1);
      const w = new WeatherWidget(p.weather, p.statusBar.time);
      w.position.set(GRID_LEFT, GRID_TOP + row * ROW_PITCH);
      this.addChild(w);
    }

    // Grid icons
    const textures = await Promise.all(
      p.home.grid.map((s) => (s ? loadTexture(slotUrl(s, catalog)) : Promise.resolve(null))),
    );
    p.home.grid.forEach((slot, i) => {
      if (!slot || widgetRows.has(Math.floor(i / GRID_COLS))) return;
      const { x, y } = cellPos(i);
      this.addChild(this.icon(slot, textures[i], x, y, true));
    });

    // Dock (frosted glass made from a blurred copy of the wallpaper)
    const dockW = STAGE_W - DOCK_MARGIN * 2;
    const dock = new Container();
    if (wallTex) {
      const blurred = new Sprite(wallTex);
      cover(blurred);
      blurred.filters = [new BlurFilter({ strength: 48, quality: 4 })];
      const m = new Graphics().roundRect(DOCK_MARGIN, DOCK_Y, dockW, DOCK_H, 38 * PT).fill(0xffffff);
      blurred.mask = m;
      dock.addChild(blurred, m);
    }
    dock.addChild(new Graphics().roundRect(DOCK_MARGIN, DOCK_Y, dockW, DOCK_H, 38 * PT).fill({ color: 0xffffff, alpha: 0.22 }));
    dock.addChild(new Graphics().roundRect(DOCK_MARGIN, DOCK_Y, dockW, DOCK_H, 38 * PT).stroke({ color: 0xffffff, alpha: 0.35, width: 1.2 * PT }));
    this.addChild(dock);
    const dockTex = await Promise.all(p.home.dock.map((s) => (s ? loadTexture(slotUrl(s, catalog)) : Promise.resolve(null))));
    p.home.dock.slice(0, 4).forEach((slot, i) => {
      if (!slot) return;
      const x = GRID_LEFT + i * COL_PITCH;
      const y = DOCK_Y + (DOCK_H - ICON) / 2;
      this.addChild(this.icon(slot, dockTex[i], x, y, false));
    });

    if (p.home.showSearchPill) this.addChild(this.searchPill(p.home.searchLabel, wallTex));
  }

  private icon(slot: IconSlot, tex: Texture | null, x: number, y: number, withLabel: boolean): Container {
    const c = new Container();
    c.position.set(x, y);
    let art: Container;
    if (tex) {
      const s = new Sprite(tex);
      s.width = ICON;
      s.height = ICON;
      art = s;
    } else if (slot.role === 'game') {
      // the game's icon is not available (private art): make it obvious it must be set in Studio
      art = new Container();
      art.addChild(new Graphics().roundRect(0, 0, ICON, ICON, ICON_RADIUS).fill({ color: 0xff8a00, alpha: 0.18 }));
      art.addChild(
        new Graphics()
          .roundRect(1.5 * PT, 1.5 * PT, ICON - 3 * PT, ICON - 3 * PT, ICON_RADIUS)
          .stroke({ color: 0xff8a00, width: 2.4 * PT, alpha: 0.95 }),
      );
      const t = new Text({
        text: '+\nyour icon',
        style: { fontFamily: IOS_FONT, fontSize: 11 * PT, fontWeight: '700', fill: 0xff8a00, align: 'center', lineHeight: 13 * PT },
      });
      t.anchor.set(0.5);
      t.position.set(ICON / 2, ICON / 2);
      art.addChild(t);
    } else {
      // placeholder: rounded tile with the first letter
      art = new Container();
      art.addChild(new Graphics().roundRect(0, 0, ICON, ICON, ICON_RADIUS).fill(0x2c2c2e));
      const t = new Text({ text: slot.label.slice(0, 1), style: { fontFamily: IOS_FONT, fontSize: 30 * PT, fontWeight: '600', fill: 0xffffff } });
      t.anchor.set(0.5);
      t.position.set(ICON / 2, ICON / 2);
      art.addChild(t);
    }
    c.addChild(art);
    if (withLabel) {
      const label = new Text({
        text: slot.label,
        style: {
          fontFamily: IOS_FONT, fontSize: 12 * PT, fontWeight: '500', fill: 0xffffff,
          dropShadow: { color: 0x000000, alpha: 0.35, blur: 3 * PT, distance: 0.6 * PT, angle: Math.PI / 2 },
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(ICON / 2, ICON + 5 * PT);
      if (label.width > ICON + 22 * PT) label.scale.set((ICON + 22 * PT) / label.width);
      c.addChild(label);
    }
    if (slot.role === 'game' && !this.gameIcon) this.gameIcon = c;
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const shade = new Graphics().roundRect(0, 0, ICON, ICON, ICON_RADIUS).fill({ color: 0x000000, alpha: 0.35 });
    shade.visible = false;
    c.addChild(shade);
    c.on('pointerdown', () => (shade.visible = true));
    c.on('pointerupoutside', () => (shade.visible = false));
    c.on('pointerup', () => {
      shade.visible = false;
      if (slot.role === 'game') this.onOpen({ slot, x, y, size: ICON, texture: tex });
    });
    return c;
  }

  private searchPill(label: string, wallTex: Texture | null): Container {
    const c = new Container();
    const t = new Text({ text: label, style: { fontFamily: IOS_FONT, fontSize: 13 * PT, fontWeight: '600', fill: 0xffffff } });
    const glyph = 11 * PT, gap = 5 * PT, padX = 12 * PT, h = 30 * PT;
    const w = padX * 2 + glyph + gap + t.width;
    const x = (STAGE_W - w) / 2, y = DOCK_Y - 16 * PT - h;
    if (wallTex) {
      const blurred = new Sprite(wallTex);
      cover(blurred);
      blurred.filters = [new BlurFilter({ strength: 40, quality: 3 })];
      const m = new Graphics().roundRect(x, y, w, h, h / 2).fill(0xffffff);
      blurred.mask = m;
      c.addChild(blurred, m);
    }
    c.addChild(new Graphics().roundRect(x, y, w, h, h / 2).fill({ color: 0xffffff, alpha: 0.2 }));
    const g = new Graphics();
    const gx = x + padX + glyph * 0.42, gy = y + h / 2 - glyph * 0.08, r = glyph * 0.36;
    g.circle(gx, gy, r).stroke({ color: 0xffffff, width: 1.8 * PT });
    g.moveTo(gx + r * 0.72, gy + r * 0.72).lineTo(gx + r * 1.55, gy + r * 1.55).stroke({ color: 0xffffff, width: 2 * PT, cap: 'round' });
    c.addChild(g);
    t.anchor.set(0, 0.5);
    t.position.set(x + padX + glyph + gap, y + h / 2);
    c.addChild(t);
    return c;
  }
}
