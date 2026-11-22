import { describe, expect, it } from 'vitest';
import { cropImage, pallorFromCrop } from '../src/cv/eye';

function solid(w: number, h: number, rgb: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

describe('eye crops', () => {
  it('crops within bounds', () => {
    const c = cropImage(solid(20, 10, [10, 20, 30]), 15, 5, 10, 10);
    expect(c.width).toBe(5);
    expect(c.height).toBe(5);
    expect([...c.data.slice(0, 3)]).toEqual([10, 20, 30]);
  });

  it('pale tissue scores higher than well-perfused red tissue', () => {
    const pale = pallorFromCrop(cropImage(solid(40, 40, [214, 165, 160]), 0, 0, 40, 40))!;
    const red = pallorFromCrop(cropImage(solid(40, 40, [180, 70, 78]), 0, 0, 40, 40))!;
    expect(pale.probability).toBeGreaterThan(red.probability);
  });

  it('returns null for an empty (all highlight) crop', () => {
    expect(pallorFromCrop(cropImage(solid(40, 40, [255, 255, 255]), 0, 0, 40, 40))).toBeNull();
  });
});
