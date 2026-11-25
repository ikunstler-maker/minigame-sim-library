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
import { resolveValues } from './coin-volcano-code/values';
import { fillTemplate } from '../money';

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

/** Numbers of one take used by the notification and the page. */
export interface TakeValues {
  win: number;
  start: number;
  balance: number;
  id: string;
}

/**
 * The big win of the configured take (code: total x multiplier from script.json;
 * plate: the SIZZLING count) and the wallet balance after it.
 */
export async function takeValues(preset: Preset, id: string): Promise<TakeValues> {
  let win = 7800;
  try {
    if (preset.game.variant === 'code') {
      const script = await fetch('./private/coin-volcano/code/script.json').then((r) => r.json());
      win = resolveValues(script, preset.game.values).bigwin ?? win;
    } else {
      const json = await fetch('./private/coin-volcano/plate/patches.json').then((r) => r.json());
      const items = Array.isArray(json) ? json : (json.items ?? []);
      win = deriveTotals(items, preset.game.values)['counter:sizzling:to'] ?? win;
    }
  } catch {
    /* game files missing: keep the reference win */
  }
  const start = preset.push.startBalance;
  return { win, start, balance: start + win, id };
}

/** Build the end-of-take notification banner from the preset (not yet shown). */
export async function createPushBanner(preset: Preset, v: TakeValues): Promise<NotificationBanner> {
  const p = preset.push;
  const url = p.iconId === 'custom' ? (p.customSrc ?? '') : slotUrl({ iconId: p.iconId, label: '', role: 'app' }, await loadCatalog());
  const filled = { ...p, title: fillTemplate(p.title, v, preset.region), body: fillTemplate(p.body, v, preset.region) };
  return new NotificationBanner(filled, await loadTexture(url));
}
