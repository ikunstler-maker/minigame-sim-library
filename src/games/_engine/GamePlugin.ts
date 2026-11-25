import type { Container } from 'pixi.js';

/**
 * Contract between the stage (home screen, app-open zoom, push) and a game.
 *
 * A plugin IS a PixiJS `Container` laid out in stage space (1080x2340, see
 * `STAGE_W/STAGE_H` in src/config.ts). The stage may scale and move it freely
 * (e.g. during the app-open zoom); the plugin never assumes its own transform.
 *
 * Lifecycle: construct -> `await load()` -> add to the scene -> `start()` ->
 * ... `onFinished()` ... -> `destroy()`.
 */
export interface GamePlugin extends Container {
  /**
   * Fetch and decode every media file the game needs. Resolves when the first
   * frame can be drawn, so the app-open zoom never shows an empty window.
   * Missing optional media must not reject; only a missing required asset does.
   */
  load(): Promise<void>;

  /** Begin the take. Call once, after `load()` resolved. */
  start(): void;

  /**
   * Optional per-frame tick in milliseconds, for plugins the stage drives
   * manually. Plugins that attach to a ticker themselves document that.
   */
  update?(dtMs: number): void;

  /**
   * Fired once when the game take is over (e.g. after the big win), so the
   * orchestrator can show the push notification next. Assign before `start()`.
   */
  onFinished: () => void;

  /** Stop playback and free GPU, media and audio resources. */
  destroy(): void;
}
