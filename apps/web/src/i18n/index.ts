import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
import hne from './hne.json';
import { load, save } from '../lib/storage';

export type Lang = 'hi' | 'hne' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
  { id: 'hne', label: 'छत्तीसगढ़ी' },
];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, hne: { translation: hne } },
  lng: load<Lang>('niktan.lang', 'en'),
  // Chhattisgarhi covers greetings and key lines; Hindi fills the rest.
  fallbackLng: { hne: ['hi', 'en'], hi: ['en'], default: ['en'] },
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  save('niktan.lang', lng);
  document.documentElement.lang = lng === 'en' ? 'en' : 'hi';
});

/** Picks the right side of a bilingual {hi, en} record from core data. */
export function pickLang<T extends { hi: string; en: string }>(rec: T, lang: string): string {
  return lang === 'en' ? rec.en : rec.hi;
}

export default i18n;
