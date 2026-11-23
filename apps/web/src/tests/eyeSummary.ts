import type { TFunction } from 'i18next';
import { assessCataract, assessJaundice, type EyeFlags, type RiskLevel, type Vision } from '@niktan/core';

export interface EyeRiskView {
  level: RiskLevel | null;
  /** "Likely", "Possible", "No flag" or "Not checked". */
  label: string;
  /** Evidence for staff, e.g. "sclera b* 23 (white-referenced) · reported dark urine". */
  evidence: string;
}

const levelLabel = (level: RiskLevel | null, t: TFunction) =>
  level === null ? t('common.notChecked') : level === 'likely' ? t('card.riskLikely') : level === 'possible' ? t('card.riskPossible') : t('card.noFlag');

export function jaundiceView(eye: EyeFlags | null | undefined, t: TFunction): EyeRiskView {
  const r = assessJaundice(eye);
  const parts: string[] = [];
  if (eye?.scleraB != null) parts.push(`${t('eyeSignal.scleraB', { n: eye.scleraB.toFixed(0) })} (${t(eye.scleraReferenced ? 'eyeSignal.referenced' : 'eyeSignal.unreferenced')})`);
  for (const s of r.signals.filter((x) => x.startsWith('reported'))) parts.push(t(`eyeSignal.${s}`));
  return { level: r.level, label: levelLabel(r.level, t), evidence: parts.join(' · ') };
}

export function cataractView(eye: EyeFlags | null | undefined, age: number, vision: Vision | null | undefined, t: TFunction): EyeRiskView {
  const r = assessCataract(eye, age, vision);
  const parts: string[] = [];
  if (eye?.pupilOpacity != null) parts.push(t('eyeSignal.opacity', { n: eye.pupilOpacity.toFixed(2) }));
  for (const s of r.signals.filter((x) => !x.startsWith('pupil'))) parts.push(t(`eyeSignal.${s}`));
  return { level: r.level, label: levelLabel(r.level, t), evidence: parts.join(' · ') };
}
