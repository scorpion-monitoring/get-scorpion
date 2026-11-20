// Fills the Upcoming events section (src/components/Events.astro) from /events/events.json
// (docs/plan.md §4). The feed is untrusted: entries that fail the shape check, are past or link
// anywhere but https: are dropped (src/lib/events.ts). The DOM is built from the section's
// <template> with textContent only. Any failure leaves the section hidden, silently.
//
// This file is bundled into an external, hashed script; astro.config.mjs keeps Astro from inlining
// it, so the page keeps `script-src 'self'` (docs/plan.md §6). It contains no visible text.
import {
  PAGE_SIZE,
  TIME_ZONE,
  parseWhen,
  upcomingEvents,
  type EventLocale,
  type FeedEvent,
} from '../lib/events.ts';

const FEED = '/events/events.json';

function locale(): EventLocale {
  return document.documentElement.lang === 'de' ? 'de' : 'en';
}

function formatWhen(event: FeedEvent, lang: EventLocale): string {
  const start = parseWhen(event.start);
  const end = parseWhen(event.end);
  if (!start || !end) return '';
  if (start.instant === undefined || end.instant === undefined) {
    // A day is a calendar date; formatting it at UTC midnight in UTC keeps it the same day.
    const format = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' });
    return format.formatRange(
      Date.UTC(start.year, start.month - 1, start.day),
      Date.UTC(end.year, end.month - 1, end.day),
    );
  }
  const format = new Intl.DateTimeFormat(lang, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
    timeZoneName: 'short',
  });
  return format.formatRange(start.instant, end.instant);
}

function field(item: Element, name: string): HTMLElement {
  const element = item.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (!element) throw new Error(name);
  return element;
}

function renderItem(template: HTMLTemplateElement, event: FeedEvent, lang: EventLocale) {
  const item = template.content.firstElementChild?.cloneNode(true);
  if (!(item instanceof HTMLElement)) throw new Error('template');
  field(item, 'title').textContent = event.title[lang];
  field(item, 'when').textContent = formatWhen(event, lang);
  field(item, 'location').textContent = event.location;
  field(item, 'summary').textContent = event.summary[lang];
  // The leading space separates the link text from the title in the accessible name; Astro's
  // HTML compression drops the whitespace before the span.
  field(item, 'link-title').textContent = ` ${event.title[lang]}`;
  const link = field(item, 'url');
  if (!(link instanceof HTMLAnchorElement)) throw new Error('url');
  link.href = event.url;
  return item;
}

async function main() {
  const section = document.querySelector<HTMLElement>('[data-events]');
  const list = section?.querySelector<HTMLUListElement>('[data-events-list]');
  const template = section?.querySelector<HTMLTemplateElement>('template[data-events-item]');
  const pager = section?.querySelector<HTMLElement>('[data-events-pager]');
  const previous = section?.querySelector<HTMLButtonElement>('[data-events-previous]');
  const next = section?.querySelector<HTMLButtonElement>('[data-events-next]');
  const status = section?.querySelector<HTMLElement>('[data-events-status]');
  if (!section || !list || !template || !pager || !previous || !next || !status) return;

  const response = await fetch(FEED, { cache: 'no-cache', credentials: 'omit' });
  if (!response.ok) return;
  const events = upcomingEvents(await response.json(), Date.now());
  if (events.length === 0) return;

  const lang = locale();
  const items = events.map((event) => renderItem(template, event, lang));
  const pages = Math.ceil(items.length / PAGE_SIZE);
  const statusText = section.dataset.pageStatus ?? '';
  let page = 0;

  const show = () => {
    list.replaceChildren(...items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
    status.textContent = statusText
      .replace('{page}', String(page + 1))
      .replace('{pages}', String(pages));
  };
  const turn = (by: number, button: HTMLButtonElement, other: HTMLButtonElement) => {
    page = Math.min(Math.max(page + by, 0), pages - 1);
    show();
    // A disabled button loses focus; keep keyboard users in the pager.
    if (button.disabled) other.focus();
  };
  previous.addEventListener('click', () => turn(-1, previous, next));
  next.addEventListener('click', () => turn(1, next, previous));

  show();
  pager.hidden = pages < 2;
  section.hidden = false;
}

main().catch(() => {
  // Network, JSON or template errors leave the section hidden; there is nothing to tell visitors.
});
