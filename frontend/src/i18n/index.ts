import { id } from './id';
import { en } from './en';
import { dictionaries, type Lang } from './dictionaries';

export type { Lang } from './dictionaries';

const nested: Record<Lang, typeof id> = { id, en };

/** Server-side/frontmatter translator for the nested dictionaries. */
export function t(lang: Lang, path: string): string {
  const keys = path.split('.');
  let result: unknown = nested[lang];
  for (const key of keys) {
    if (result && typeof result === 'object' && key in (result as Record<string, unknown>)) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof result === 'string' ? result : path;
}

/** Flat-dictionary lookup for the client-side LanguageSwitcher. */
export function flatT(lang: Lang, key: string): string {
  return (dictionaries[lang] as Record<string, string>)[key] ?? key;
}

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'id';
  return localStorage.getItem('lang') === 'en' ? 'en' : 'id';
}

export function setLang(lang: Lang): void {
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}
