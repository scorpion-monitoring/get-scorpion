// The pages of the site and their path in each locale (docs/plan.md §5, §7). The head metadata
// (canonical URL, hreflang alternates, og:url), the language switcher and the sitemap all read this
// table, so a page and its translation stay linked even where the slugs differ.
//
// A new page needs a row here, one .astro file per locale under src/pages/, and its texts in
// messages/.
import type { Locale } from '../paraglide/runtime.js';

export const PAGES = {
  home: { en: '/', de: '/de/' },
} as const satisfies Record<string, Record<Locale, string>>;

export type PageId = keyof typeof PAGES;

/** The path of a page in a locale, for example `/de/`. */
export function pagePath(page: PageId, locale: Locale): string {
  return PAGES[page][locale];
}

/** The absolute URL of a page in a locale, on the configured `site`. */
export function pageUrl(page: PageId, locale: Locale, site: URL | undefined): string {
  if (!site) throw new Error('`site` must be set in astro.config.mjs');
  return new URL(pagePath(page, locale), site).href;
}

/** Open Graph locale of each page locale. The English copy uses British spelling. */
export const OG_LOCALE: Record<Locale, string> = { en: 'en_GB', de: 'de_DE' };
