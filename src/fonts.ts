import { loadGameFonts } from './games/coin-volcano-plate/numbers/numberStyles';

/** A font uploaded by the user, stored in the preset as a data URL. */
export interface CustomFont {
  name: string;
  src: string;
}

/** Fonts offered for page texts and the amount. 'system' = iOS system font (SF on iPhone). */
export const FONT_CHOICES: { id: string; label: string }[] = [
  { id: 'system', label: 'System (SF Pro on iPhone)' },
  { id: 'game:Montserrat', label: 'Montserrat (game font)' },
  ...[
    'Inter', 'Roboto', 'Open Sans', 'Poppins', 'Lato', 'Nunito', 'Rubik', 'Manrope', 'DM Sans',
    'Space Grotesk', 'Raleway', 'Ubuntu', 'PT Sans', 'Source Sans 3', 'Work Sans', 'Outfit',
    'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Playfair Display', 'Merriweather',
    'Roboto Mono', 'JetBrains Mono', 'Orbitron', 'Lilita One',
  ].map((f) => ({ id: `google:${f}`, label: f })),
];

const SYSTEM = ['-apple-system', 'SF Pro Display', 'Helvetica Neue', 'Arial', 'sans-serif'];
const loaded = new Map<string, Promise<void>>();

function loadGoogle(family: string): Promise<void> {
  let p = loaded.get(family);
  if (!p) {
    p = (async () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;800&display=swap`;
      document.head.appendChild(link);
      await new Promise<void>((res) => {
        link.onload = () => res();
        link.onerror = () => res();
      });
      await Promise.all(['400', '600', '800'].map((w) => document.fonts.load(`${w} 40px "${family}"`).catch(() => undefined)));
    })();
    loaded.set(family, p);
  }
  return p;
}

function loadCustom(f: CustomFont): Promise<void> {
  const key = `custom:${f.name}:${f.src.length}`;
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      const face = new FontFace(f.name, `url(${f.src})`);
      await face.load();
      document.fonts.add(face);
    })().catch((e) => console.warn('font failed', f.name, e));
    loaded.set(key, p);
  }
  return p;
}

/**
 * Make sure a font is ready and return the font-family list for PixiJS Text.
 * Unknown or failed fonts fall back to the system font.
 */
export async function ensureFont(id: string | undefined, custom: CustomFont[]): Promise<string[]> {
  if (!id || id === 'system') return SYSTEM;
  if (id === 'game:Montserrat') {
    await loadGameFonts().catch(() => undefined);
    return ['CVMontserrat', ...SYSTEM];
  }
  if (id.startsWith('google:')) {
    const family = id.slice(7);
    await loadGoogle(family);
    return [family, ...SYSTEM];
  }
  if (id.startsWith('custom:')) {
    const f = custom.find((c) => c.name === id.slice(7));
    if (f) {
      await loadCustom(f);
      return [f.name, ...SYSTEM];
    }
  }
  return SYSTEM;
}

/** Read an uploaded font file into a CustomFont (name from the file name). */
export function fileToFont(file: File): Promise<CustomFont> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^\w -]/g, ''), src: String(r.result) });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
