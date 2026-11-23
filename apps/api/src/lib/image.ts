import { HTTPException } from 'hono/http-exception';

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/** Validates an uploaded photo and returns it base64-encoded for the vision providers. */
export async function photoInput(file: unknown): Promise<{ imageBase64: string; mimeType: string }> {
  if (!(file instanceof File) || !file.size) throw new HTTPException(400, { message: 'Add a photo' });
  if (file.size > MAX_PHOTO_BYTES) throw new HTTPException(413, { message: 'Photo too large' });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HTTPException(415, { message: 'Use a JPEG, PNG or WebP photo' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { imageBase64: btoa(binary), mimeType: file.type };
}
