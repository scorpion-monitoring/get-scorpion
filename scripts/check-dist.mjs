// Checks the built site in dist/ (docs/plan.md §6, §7). `pnpm build` runs it after `astro build`.
//
// Every page:
// - has no inline style (`<style>`, `style=""`) and no inline script, apart from at most one
//   `<script type="application/ld+json">` data block; other scripts are external module scripts
//   from our own /_astro/;
// - has its canonical URL, og:url and og:image as absolute URLs on the site.
// The landing pages (/ and /de/) carry exactly one JSON-LD block, which parses, contains no `<`,
// passes the ComputationalTool 1.0-RELEASE check, states the pinned release as softwareVersion and
// the page language as inLanguage.
// They also link /events/events.jsonld as `alternate` (docs/plan.md §4), and the empty fallbacks
// public/events/events.json and events.jsonld are valid and empty.
// Also: robots.txt names the sitemap, sitemap.xml lists every page in every locale with its
// alternates, and the Open Graph images exist.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFeed, validateJsonLdText } from './build-events.mjs';
import { checkNode } from './lib/bioschemas.mjs';
import { PROFILE_CHECK, loadComputationalTool } from './lib/structured-data.mjs';
import { PAGES } from '../src/lib/pages.ts';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const SITE = 'https://scorpion.bi.denbi.de';
const LOCALES = ['en', 'de'];

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

const version = JSON.parse(
  readFileSync(join(ROOT, 'src/assets/generated/docs-export.json'), 'utf8'),
).scorpionVersion;
const profile = loadComputationalTool();

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const meta = (html, property) =>
  attr(
    new RegExp(`<meta (?:property|name)="${property}" content="[^"]*"[^>]*>`).exec(html)?.[0] ?? '',
    'content',
  );

for (const [page, paths] of Object.entries(PAGES)) {
  for (const locale of LOCALES) {
    const path = paths[locale];
    const where = `dist${path}index.html`;
    const file = join(DIST, path, 'index.html');
    if (!existsSync(file)) {
      fail(where, 'missing');
      continue;
    }
    const html = readFileSync(file, 'utf8');
    const url = `${SITE}${path}`;

    if (attr(/<html[^>]*>/.exec(html)?.[0] ?? '', 'lang') !== locale)
      fail(where, `lang is not ${locale}`);
    if (/<style[\s>]/i.test(html) || /\sstyle=/i.test(html)) fail(where, 'inline style');
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    if (canonical !== url) fail(where, `canonical is ${canonical}, expected ${url}`);
    if (meta(html, 'og:url') !== url) fail(where, 'og:url');
    if (meta(html, 'og:image') !== `${SITE}/og/${locale}.png`) fail(where, 'og:image');
    if (/twitter:/.test(html)) fail(where, 'Twitter tags (decided against)');

    const blocks = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attributes, body] = match;
      const type = attr(attributes, 'type');
      const src = attr(attributes, 'src');
      if (type === 'application/ld+json' && !src) blocks.push(body);
      else if (type === 'module' && src?.startsWith('/_astro/') && body.trim() === '') continue;
      else fail(where, `unexpected script <script${attributes}>`);
    }
    if (blocks.length > 1) fail(where, `${blocks.length} JSON-LD blocks`);
    const eventsLink =
      /<link rel="alternate" type="application\/ld\+json" href="\/events\/events\.jsonld"/.test(
        html,
      );
    if (eventsLink !== (page === 'home')) {
      fail(where, `events.jsonld link ${eventsLink ? 'not expected' : 'missing'}`);
    }
    if (page !== 'home') continue;
    if (blocks.length !== 1) {
      fail(where, 'no JSON-LD block');
      continue;
    }
    if (blocks[0].includes('<')) fail(where, 'unescaped < in the JSON-LD block');
    let node;
    try {
      node = JSON.parse(blocks[0]);
    } catch (error) {
      fail(where, `JSON-LD doesn't parse: ${error.message}`);
      continue;
    }
    for (const problem of checkNode(node, profile, PROFILE_CHECK)) fail(where, problem);
    if (node.softwareVersion !== version) fail(where, `softwareVersion is not ${version}`);
    if (node.inLanguage !== locale) fail(where, `inLanguage is not ${locale}`);
    if (node.url !== url) fail(where, `url is not ${url}`);
  }
}

const robots = existsSync(join(DIST, 'robots.txt'))
  ? readFileSync(join(DIST, 'robots.txt'), 'utf8')
  : '';
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('dist/robots.txt', 'no Sitemap line');
if (/^Disallow:\s*\S/m.test(robots)) fail('dist/robots.txt', 'disallows something');

const sitemap = existsSync(join(DIST, 'sitemap.xml'))
  ? readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  : '';
for (const paths of Object.values(PAGES)) {
  for (const locale of LOCALES) {
    const url = `${SITE}${paths[locale]}`;
    if (!sitemap.includes(`<loc>${url}</loc>`)) fail('dist/sitemap.xml', `no <loc> ${url}`);
    if (!sitemap.includes(`hreflang="${locale}" href="${url}"`)) {
      fail('dist/sitemap.xml', `no alternate ${locale} ${url}`);
    }
  }
}

const feedFile = join(DIST, 'events/events.json');
const jsonldFile = join(DIST, 'events/events.jsonld');
if (!existsSync(feedFile) || !existsSync(jsonldFile)) {
  fail('dist/events/', 'events.json or events.jsonld missing');
} else {
  const feed = JSON.parse(readFileSync(feedFile, 'utf8'));
  for (const problem of validateFeed(feed)) fail('dist/events/events.json', problem);
  if (feed.events?.length !== 0) fail('dist/events/events.json', 'the fallback must be empty');
  const jsonld = readFileSync(jsonldFile, 'utf8');
  for (const problem of validateJsonLdText(jsonld)) fail('dist/events/events.jsonld', problem);
  if (JSON.parse(jsonld)['@graph']?.length !== 0) {
    fail('dist/events/events.jsonld', 'the fallback must be empty');
  }
}

for (const file of ['og/en.png', 'og/de.png', 'favicon.ico', 'apple-touch-icon.png']) {
  if (!existsSync(join(DIST, file))) fail(`dist/${file}`, 'missing');
}

if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-dist: dist/ passes (scripts, styles, metadata, JSON-LD, sitemap, robots.txt)');
