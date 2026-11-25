import { Texture } from 'pixi.js';

const cache = new Map<string, Promise<Texture | null>>();

/**
 * Load an image (path or data URL) as a texture. Resolves null on failure,
 * so scenes can draw a placeholder instead of crashing.
 */
export function loadTexture(url: string): Promise<Texture | null> {
  if (!url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(Texture.from(img));
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}
