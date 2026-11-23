import type { TFunction } from 'i18next';
import type { Vision } from '@niktan/core';

/** One line for the extra vision checks, e.g. "Contrast 1.65 · Colour 5/5 · Dial even"; empty if none ran. */
export function visionExtrasLine(v: Vision | null | undefined, t: TFunction): string {
  if (!v) return '';
  const parts: string[] = [];
  if (v.astigmatism && (v.astigmatism.right !== null || v.astigmatism.left !== null)) {
    parts.push(`${t('vision.stepDial')} ${v.astigmatism.right || v.astigmatism.left ? t('vision.dialFlag').toLowerCase() : t('vision.dialOk').toLowerCase()}`);
  }
  if (v.contrastLogCs != null) parts.push(`${t('vision.stepContrast')} ${v.contrastLogCs.toFixed(2)}`);
  if (v.colour) parts.push(`${t('vision.stepColour')} ${v.colour.flag === null ? '?' : `${v.colour.correct}/${v.colour.total}`}`);
  return parts.join(' · ');
}
