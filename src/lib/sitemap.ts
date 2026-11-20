// Writes sitemap.xml with hreflang alternates (docs/plan.md §7). Hand-written instead of
// @astrojs/sitemap, since the site has only a few pages (decision of 2026-11-20). Imports nothing,
// so scripts can load it too.

export interface SitemapPage {
  /** Absolute URL of each locale's version, keyed by hreflang. */
  urls: Record<string, string>;
  /** hreflang of the x-default version. */
  defaultLocale: string;
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A sitemap with one <url> per page and locale, each listing all versions as alternates. */
export function buildSitemap(pages: SitemapPage[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const page of pages) {
    const defaultUrl = page.urls[page.defaultLocale];
    if (!defaultUrl) throw new Error(`No URL for the default locale ${page.defaultLocale}`);
    const alternates = [...Object.entries(page.urls), ['x-default', defaultUrl]].map(
      ([hreflang, href]) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`,
    );
    for (const url of Object.values(page.urls)) {
      lines.push('  <url>', `    <loc>${escapeXml(url)}</loc>`, ...alternates, '  </url>');
    }
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}
