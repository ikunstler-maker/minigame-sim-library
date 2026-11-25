import type { IconSlot } from '../config';

/** One icon the Studio can place on the home screen. */
export interface CatalogIcon {
  id: string;
  label: string;
  url: string;
}

/** Game icons. Their art lives in public/private/ (local builds only). */
const GAME_ICONS: CatalogIcon[] = [
  { id: 'coin-volcano', label: 'Coin Volcano', url: './private/coin-volcano/icon.png' },
];

let catalog: CatalogIcon[] | null = null;

/** Load the iOS icon catalog (public/ios/icons/icons.json) plus game icons. */
export async function loadCatalog(): Promise<CatalogIcon[]> {
  if (catalog) return catalog;
  let ios: CatalogIcon[] = [];
  try {
    const list = (await fetch('./ios/icons/icons.json').then((r) => r.json())) as { id: string; label: string; file: string }[];
    ios = list.map((e) => ({ id: e.id, label: e.label, url: `./ios/icons/${e.file}` }));
  } catch {
    /* catalog missing: Studio still works with uploads */
  }
  catalog = [...GAME_ICONS, ...ios];
  return catalog;
}

/** Image URL for a slot, or '' when unknown. */
export function slotUrl(slot: IconSlot, cat: CatalogIcon[]): string {
  if (slot.iconId === 'custom') return slot.customSrc ?? '';
  return cat.find((c) => c.id === slot.iconId)?.url ?? '';
}
