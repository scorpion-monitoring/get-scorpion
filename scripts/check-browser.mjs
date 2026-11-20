// `pnpm check:browser`: the browser checks of the built site (docs/plan.md §6, §8). Run it after
// `pnpm build`; it needs Chromium for playwright-core (`pnpm exec playwright-core install chromium`).
//
// dist/ is served with the CSP of §6 (scripts/lib/static-server.mjs). Each landing page (/ and
// /de/) is checked in the light and the dark theme (`colorScheme`) at 375 and 1280 px, once with the
// empty fallback /events/events.json from dist/ and once with a feed built from the test fixtures
// (scripts/fixtures/events/), so the rendered event cards are checked too. Each run checks:
// - axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA rules, after scrolling through the page;
// - exactly one h1; the skip link is the first Tab stop, visible when focused, and moves focus to
//   <main>; no horizontal scrolling; at 375 px the nav <details> menu opens and shows its links;
// - no request leaves the origin (each one is aborted and reported), no console error, no uncaught
//   exception and no CSP violation;
// - the events section: hidden with the fallback, five cards and a pager with the fixtures.
// Plus, per locale, that `#event-<id>` opens the pager page of that event and focuses its heading.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import axe from 'axe-core';
import { chromium } from 'playwright-core';
import { buildFeed, validateEventFiles, validateFeed } from './build-events.mjs';
import { serve } from './lib/static-server.mjs';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const FIXTURES = join(import.meta.dirname, 'fixtures', 'events');

const PAGES = ['/', '/de/'];
const SCHEMES = ['light', 'dark'];
const WIDTHS = [375, 1280];
// axe-core tags for WCAG 2.2 level AA: every A and AA rule of 2.0, 2.1 and 2.2.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

// The moment the fixture feed is built for and the browser clock is fixed to, so the fixtures don't
// age: six upcoming events (two pager pages), one past.
const NOW = Date.parse('2026-11-20T12:00:00Z');
const FIXTURE_EVENTS = 6;
const LAST_EVENT = 'summit';

function fixtureFeed() {
  const files = readdirSync(FIXTURES).map((name) => ({
    name,
    text: readFileSync(join(FIXTURES, name), 'utf8'),
  }));
  const { events, errors } = validateEventFiles(files);
  assert.deepEqual(errors, [], 'the event fixtures are valid');
  const feed = buildFeed(events, NOW);
  assert.deepEqual(validateFeed(feed), []);
  assert.equal(feed.events.length, FIXTURE_EVENTS);
  assert.equal(feed.events.at(-1).id, LAST_EVENT);
  return feed;
}

let server;
let browser;
let feed;

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'dist/ is missing; run `pnpm build` first');
  feed = fixtureFeed();
  server = await serve(DIST);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Opens `path` in a fresh context and records what must not happen: requests to another origin
 * (aborted), console errors, uncaught exceptions and CSP violations.
 */
async function open(path, { scheme = 'light', width = 1280, withFeed = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  await context.clock.setFixedTime(NOW);
  const problems = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== server.origin) {
      problems.push(`third-party request: ${url.href}`);
      return route.abort('blockedbyclient');
    }
    if (withFeed && url.pathname === '/events/events.json') {
      return route.fulfill({ json: feed, headers: { 'cache-control': 'no-cache' } });
    }
    return route.continue();
  });
  // Runs before any page script, outside the page's CSP.
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));

  const feedResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/events/events.json',
  );
  await page.goto(`${server.origin}${path}`, { waitUntil: 'load' });
  const response = await feedResponse;
  if (response.status() !== 200) problems.push(`/events/events.json: HTTP ${response.status()}`);
  await page.waitForLoadState('networkidle');
  return { context, page, problems };
}

async function checkSkipLink(page, problems) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const box = element?.getBoundingClientRect();
    return {
      href: element?.getAttribute('href'),
      visible: !!box && box.width > 1 && box.height > 1 && box.top >= 0 && box.left >= 0,
    };
  });
  if (focused.href !== '#main') {
    problems.push(`the first Tab stop is ${focused.href ?? 'not a link'}, not the skip link`);
    return;
  }
  if (!focused.visible) problems.push('the skip link is not visible when focused');
  await page.keyboard.press('Enter');
  const target = await page.evaluate(() => document.activeElement?.id);
  if (target !== 'main') problems.push(`the skip link moves focus to "${target}", not <main>`);
}

async function checkNav(page, width, problems) {
  const menu = page.locator('header details');
  if (width >= 768) {
    if (await menu.isVisible()) problems.push('the nav <details> menu shows at desktop width');
    return;
  }
  await menu.locator('summary').click();
  if (!(await menu.evaluate((details) => details.open))) {
    problems.push('the nav <details> menu does not open');
    return;
  }
  const links = menu.locator('a');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    if (!(await links.nth(i).isVisible())) problems.push(`nav menu link ${i + 1} is not visible`);
  }
  await checkNoHorizontalScroll(page, problems, ' with the nav menu open');
  await menu.locator('summary').click();
}

async function checkNoHorizontalScroll(page, problems, when = '') {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  if (scroll > client) problems.push(`horizontal scrolling${when}: ${scroll} px in ${client} px`);
}

/** Scrolls through the page, so lazy images load (and are checked for their origin). */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
}

/**
 * Runs axe and adds each violation to `problems`. Returns the "needs review" (incomplete) results,
 * which don't fail the run; they are printed as test diagnostics, so they stay visible.
 */
async function runAxe(page, problems, include = 'html') {
  // page.evaluate runs outside the page's CSP, so axe needs no inline script.
  await page.evaluate(axe.source);
  const results = await page.evaluate(
    ([context, tags]) =>
      window.axe.run(context, {
        runOnly: { type: 'tag', values: tags },
        resultTypes: ['violations', 'incomplete'],
      }),
    [include, WCAG_TAGS],
  );
  for (const violation of results.violations) {
    const targets = violation.nodes.slice(0, 5).map((node) => node.target.join(' '));
    problems.push(
      `axe ${violation.id} (${violation.impact}): ${violation.help}; ` +
        `${violation.nodes.length} element(s): ${targets.join(', ')}`,
    );
  }
  return results.incomplete.flatMap((result) =>
    result.nodes.map((node) => `axe needs review: ${result.id} on ${node.target.join(' ')}`),
  );
}

async function checkEvents(page, withFeed, problems) {
  const section = page.locator('#events');
  if (!withFeed) {
    if (await section.isVisible())
      problems.push('the events section shows with the empty fallback');
    return;
  }
  if (!(await section.isVisible())) {
    problems.push('the events section is hidden with the fixture feed');
    return;
  }
  const cards = await section.locator('[data-events-list] > li').count();
  if (cards !== 5) problems.push(`${cards} event cards on the first page, expected 5`);
  if (!(await section.locator('[data-events-pager]').isVisible())) {
    problems.push('the events pager is hidden with six events');
  }
}

describe('landing pages', { concurrency: 4 }, () => {
  for (const path of PAGES) {
    for (const scheme of SCHEMES) {
      for (const width of WIDTHS) {
        for (const withFeed of [false, true]) {
          const name = `${path} ${scheme} ${width}px, ${withFeed ? 'fixture feed' : 'fallback feed'}`;
          test(name, async (t) => {
            const { context, page, problems } = await open(path, { scheme, width, withFeed });
            try {
              const h1 = await page.locator('h1').count();
              if (h1 !== 1) problems.push(`${h1} h1 elements, expected 1`);
              await checkSkipLink(page, problems);
              await checkNav(page, width, problems);
              await checkNoHorizontalScroll(page, problems);
              await checkEvents(page, withFeed, problems);
              await scrollThrough(page);
              await checkNoHorizontalScroll(page, problems, ' after scrolling');
              for (const note of await runAxe(page, problems)) t.diagnostic(note);
            } finally {
              await context.close();
            }
            assert.deepEqual(problems, []);
          });
        }
      }
    }
  }
});

describe('event links', () => {
  for (const path of PAGES) {
    test(`${path}#event-${LAST_EVENT} opens page 2 and focuses the event`, async () => {
      const { context, page, problems } = await open(`${path}#event-${LAST_EVENT}`, {
        withFeed: true,
      });
      try {
        await page.waitForFunction(() => document.activeElement?.tagName === 'H3');
        const focused = await page.evaluate(() => document.activeElement?.closest('li')?.id);
        if (focused !== `event-${LAST_EVENT}`) problems.push(`focus is in ${focused}`);
        await runAxe(page, problems, '#events');
      } finally {
        await context.close();
      }
      assert.deepEqual(problems, []);
    });
  }
});
