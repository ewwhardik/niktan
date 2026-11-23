/** Downscales a photo to at most `maxSide` px so uploads stay small on 3G. */
export async function shrink(file: File, url: string, maxSide = 1024, quality = 0.82): Promise<Blob> {
  const bitmap = await globalThis.createImageBitmap?.(file).catch(() => null);
  const source = bitmap ?? await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Photo decoding failed'));
    image.src = url;
  });
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo rendering failed');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap?.close();
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('JPEG encoding failed')), 'image/jpeg', quality);
  });
}
