import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import { evalOverlay, type OverlayItem } from './timeline';

/** Builds extra content (e.g. a number Text) for an item; null = none. */
export type MakeContent = (item: OverlayItem) => Container | null;

interface Entry {
  item: OverlayItem;
  /** Positioned at the box centre with pivot (w/2, h/2), so `scale` grows from the centre. */
  root: Container;
}

/**
 * Generic time-keyed overlay: one node per item, shown while t0 <= t < t1,
 * placed in stage px, with fades and an optional keyframe track.
 *
 * Inside each node (local coords 0..w, 0..h): the patch sprite (stretched to
 * w x h) first, then whatever `makeContent(item)` returns, so text drawn by the
 * orchestrator sits above the patch that hides the original number.
 */
export class TimedOverlay extends Container {
  private entries: Entry[] = [];

  /**
   * @param items      parsed overlay items (see `parseOverlayItems`)
   * @param baseUrl    plate directory URL, ending with '/'; `patch` paths are relative to it
   * @param makeContent optional hook to attach content per item
   */
  constructor(private readonly items: OverlayItem[], private readonly baseUrl: string, private readonly makeContent?: MakeContent) {
    super({ label: 'timed-overlay' });
  }

  /** Load every patch image (missing images are skipped with a warning) and build the nodes. */
  async load(): Promise<void> {
    const urls = [...new Set(this.items.map((i) => i.patch).filter((p): p is string => !!p))];
    const textures = new Map<string, Texture>();
    await Promise.all(urls.map(async (p) => {
      try {
        textures.set(p, await Assets.load<Texture>(this.baseUrl + p));
      } catch (e) {
        console.warn('[plate] overlay patch missing:', p, e);
      }
    }));
    for (const item of this.items) {
      const root = new Container({ label: `overlay:${item.id}` });
      root.pivot.set(item.w / 2, item.h / 2);
      root.visible = false;
      const tex = item.patch ? textures.get(item.patch) : undefined;
      if (tex) {
        const s = new Sprite(tex);
        s.width = item.w;
        s.height = item.h;
        root.addChild(s);
      }
      const extra = this.makeContent?.(item);
      if (extra) root.addChild(extra);
      this.addChild(root);
      this.entries.push({ item, root });
    }
  }

  /** Show/hide and place every item for plate time `t` (seconds). */
  update(t: number): void {
    for (const { item, root } of this.entries) {
      const s = evalOverlay(item, t);
      root.visible = s.visible;
      if (!s.visible) continue;
      // track x/y is the top-left of the patch as drawn (already scaled)
      root.position.set(s.x + (item.w * s.scale) / 2, s.y + (item.h * s.scale) / 2);
      root.scale.set(s.scale);
      root.alpha = s.alpha;
    }
  }

  /** Node for an item id (to tweak content later), or undefined. */
  node(id: string): Container | undefined {
    return this.entries.find((e) => e.item.id === id)?.root;
  }
}
