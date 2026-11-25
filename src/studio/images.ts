/** Read a File into an HTMLImageElement. */
function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Turn an uploaded image into a 192px iOS icon (cover-cropped, rounded corners), as a PNG data URL.
 * @param rounded apply the iOS corner mask (off for art that already has it)
 */
export async function fileToIcon(file: File, rounded = true): Promise<string> {
  const img = await readImage(file);
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  if (rounded) {
    g.beginPath();
    g.roundRect(0, 0, size, size, size * 0.225);
    g.clip();
  }
  const k = Math.max(size / img.width, size / img.height);
  const w = img.width * k, h = img.height * k;
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/png');
}

/** Downscale a wallpaper to 1080px wide JPEG data URL (keeps localStorage small). */
export async function fileToWallpaper(file: File): Promise<string> {
  const img = await readImage(file);
  const k = Math.min(1, 1080 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

/** Open a file picker for images. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Open a file picker for any accepted type (e.g. fonts). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
