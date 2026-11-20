// Fills the Upcoming events section (src/components/Events.astro) from /events/events.json
// (docs/plan.md §4). The feed is untrusted: entries that fail the shape check, are past or link
// anywhere but https: are dropped (src/lib/events.ts). The DOM is built from the section's
// <template> with textContent only (and href from validated https: URLs or a validated email
// address). Any failure leaves the section hidden, silently.
//
// A fragment `#event-<id>` (the URL of an event without its own page, docs/plan.md §4) shows the
// pager page that holds that event and moves focus to its heading; an unknown or past id is
// ignored.
//
// This file is bundled into an external, hashed script; astro.config.mjs keeps Astro from inlining
// it, so the page keeps `script-src 'self'` (docs/plan.md §6). It contains no visible text.
import {
  PAGE_SIZE,
  TIME_ZONE,
  anchorId,
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

function link(item: Element, name: string): HTMLAnchorElement {
  const element = field(item, name);
  if (!(element instanceof HTMLAnchorElement)) throw new Error(name);
  return element;
}

function renderItem(
  template: HTMLTemplateElement,
  event: FeedEvent,
  lang: EventLocale,
  typeLabel: string,
) {
  const item = template.content.firstElementChild?.cloneNode(true);
  if (!(item instanceof HTMLElement)) throw new Error('template');
  // ID_PATTERN (lowercase letters, digits, hyphens) makes this a safe id and fragment.
  item.id = anchorId(event.id);
  const title = event.title[lang];
  field(item, 'title').textContent = title;
  field(item, 'type').textContent = typeLabel;
  field(item, 'when').textContent = formatWhen(event, lang);
  field(item, 'location').textContent = event.location;
  field(item, 'summary').textContent = event.summary[lang];

  const { name, email, url } = event.contact;
  const contactUrl = link(item, 'contact-url');
  const contactEmail = link(item, 'contact-email');
  if (url) {
    contactUrl.href = url;
    contactUrl.textContent = name;
    field(item, 'contact-name').remove();
  } else {
    field(item, 'contact-name').textContent = name;
    contactUrl.remove();
  }
  if (email) {
    contactEmail.href = `mailto:${email}`;
    contactEmail.textContent = email;
  } else {
    contactEmail.remove();
  }

  // The leading space separates the link text from the title in the accessible name; Astro's
  // HTML compression drops the whitespace before the span.
  const details = link(item, 'url');
  if (event.url) {
    details.href = event.url;
    field(item, 'link-title').textContent = ` ${title}`;
  } else {
    // The event's URL is this card; a link to itself would help nobody.
    details.remove();
  }
  const registration = link(item, 'registration');
  if (event.registration) {
    registration.href = event.registration;
    field(item, 'registration-title').textContent = ` ${title}`;
  } else {
    registration.remove();
  }
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
  const items = events.map((event) => {
    const label = section.getAttribute(`data-type-${event.type}`);
    if (!label) throw new Error(event.type);
    return renderItem(template, event, lang, label);
  });
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

  /** Shows the event named by the fragment, if it is one of ours; returns whether it did. */
  const reveal = () => {
    const index = items.findIndex((item) => `#${item.id}` === window.location.hash);
    if (index < 0) return false;
    page = Math.floor(index / PAGE_SIZE);
    show();
    const heading = field(items[index] as HTMLElement, 'title');
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
    return true;
  };
  window.addEventListener('hashchange', () => {
    if (!section.hidden) reveal();
  });

  show();
  pager.hidden = pages < 2;
  section.hidden = false;
  // The browser looked for the fragment before the events existed; do it now.
  reveal();
}

main().catch(() => {
  // Network, JSON or template errors leave the section hidden; there is nothing to tell visitors.
});
