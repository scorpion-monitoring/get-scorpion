// /sitemap.xml: every page of src/lib/pages.ts in every locale, with hreflang alternates
// (docs/plan.md §7). public/robots.txt points here. Built to a static file.
import type { APIRoute } from 'astro';
import { PAGES, pageUrl, type PageId } from '../lib/pages';
import { buildSitemap } from '../lib/sitemap';
import { baseLocale, locales } from '../paraglide/runtime.js';

export const GET: APIRoute = ({ site }) => {
  const pages = (Object.keys(PAGES) as PageId[]).map((page) => ({
    urls: Object.fromEntries(locales.map((l) => [l, pageUrl(page, l, site)])),
    defaultLocale: baseLocale,
  }));
  return new Response(buildSitemap(pages), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
