import type { Ticker } from 'pixi.js';
import type { AudioBus } from '../audio/AudioBus';
import type { Preset } from '../config';
import { loadCatalog, slotUrl } from '../ios/iconCatalog';
import { NotificationBanner } from '../stage/ios/NotificationBanner';
import { loadTexture } from '../stage/textures';
import { CodeGame } from './coin-volcano-code/CodeGame';
import { PlateGame } from './coin-volcano-plate/PlateGame';
import { NumbersLayer, deriveTotals, type PatchText } from './coin-volcano-plate/numbersLayer';
import { loadGameFonts } from './coin-volcano-plate/numbers/numberStyles';

export type AnyGame = PlateGame | CodeGame;

export interface CreateGameOptions {
  ticker: Ticker;
  /** Null = silent (Studio live preview). */
  audio: AudioBus | null;
  onProgress?: (p: number) => void;
}

/**
 * Build and load the configured Coin Volcano variant ('code' or 'plate').
 * Resolves null when the game files are missing on this build.
 * Shared by the recorded Preview (StageApp) and the Studio live preview.
 */
export async function createGame(preset: Preset, o: CreateGameOptions): Promise<AnyGame | null> {
  const g = preset.game;
  const silent = !o.audio || g.soundtrack === 'off';
  try {
    await loadGameFonts();
    if (g.variant === 'code') {
      const base = './private/coin-volcano/';
      const game = new CodeGame({
        baseUrl: base,
        audio: silent ? null : o.audio,
        audioUrl: silent ? null : `${base}plate/${g.soundtrack === 'sfx' ? 'audio-sfx' : 'audio'}.m4a`,
        ticker: o.ticker,
        values: g.values,
        currency: g.currency,
        autoContinueMs: g.manualSpin ? undefined : g.autoContinueMs,
        onProgress: o.onProgress,
      });
      await game.load();
      return game;
    }
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
      audio: silent ? null : o.audio,
      audioUrl: silent ? null : g.soundtrack === 'sfx' ? `${base}audio-sfx.m4a` : `${base}audio.m4a`,
      ticker: o.ticker,
      makeContent: numbers.makeContent,
      showTapAreas: g.showTapAreas,
      autoContinueMs: g.manualSpin ? undefined : g.autoContinueMs,
      onProgress: o.onProgress,
    });
    await game.load();
    o.ticker.add(() => numbers.update(game.time));
    return game;
  } catch (e) {
    console.warn('Game unavailable:', e);
    return null;
  }
}

/** Build the end-of-take notification banner from the preset (not yet shown). */
export async function createPushBanner(preset: Preset): Promise<NotificationBanner> {
  const p = preset.push;
  const url = p.iconId === 'custom' ? (p.customSrc ?? '') : slotUrl({ iconId: p.iconId, label: '', role: 'app' }, await loadCatalog());
  return new NotificationBanner(p, await loadTexture(url));
}
