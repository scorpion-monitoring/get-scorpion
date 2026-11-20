// The rules of the events feed (docs/plan.md §4), shared by scripts/build-events.mjs (Node, which
// strips the types) and the client script src/scripts/events.ts, so the build, CI and the browser
// agree on what an event is, when it is past and in which order events come.
//
// events/events.schema.json is the published contract. `isFeedEvent` repeats its rules for the
// browser, where Ajv can't run under `script-src 'self'` (it compiles validators with `new
// Function`); `LIMITS` must equal the schema's `maxLength`s, which build-events.mjs checks.
//
// This module imports nothing, so Node can load it from a plain .mjs script.

/** Version of the events.json format. */
export const SCHEMA_VERSION = 1;

/** Dates (all-day events) are days in this time zone; date-times are shown in it. */
export const TIME_ZONE = 'Europe/Berlin';

/** Events per page in the Upcoming events section. */
export const PAGE_SIZE = 5;

export const LOCALES = ['en', 'de'] as const;
export type EventLocale = (typeof LOCALES)[number];

/** The landing page (English); an event without `url` links to its card here. */
export const SITE_URL = 'https://scorpion.bi.denbi.de/';

/** Event types (decision of 2026-11-20, docs/plan.md §1). The order is the schema's. */
export const EVENT_TYPES = ['training', 'hackathon', 'workshop', 'meeting', 'conference'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** How a training is delivered (Bioschemas courseMode). */
export const MODES = ['online', 'onsite', 'blended'] as const;
export type Mode = (typeof MODES)[number];

/**
 * Maximum lengths in characters (UTF-16 code units, as JSON Schema and JavaScript count them), and
 * the other numeric limits of the schema. build-events.mjs checks each against the schema.
 */
export const LIMITS = {
  id: 64,
  title: 120,
  summary: 400,
  location: 120,
  url: 500,
  name: 120,
  email: 254,
  ror: 40,
  address: 120,
  keyword: 40,
  keywords: 10,
  capacity: 100_000,
} as const;

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROR_PATTERN = /^https:\/\/ror\.org\/0[a-z0-9]{6}[0-9]{2}$/;
/** An email address that is safe in a mailto: link: no query, fragment, escapes or path. */
const EMAIL_PATTERN =
  /^[^\s@<>()[\]\\,;:"?#&%/]+@[^\s@<>()[\]\\,;:"?#&%/]+\.[^\s@<>()[\]\\,;:"?#&%/]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const LANGUAGE_PATTERN = /^[a-z]{2}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/;

export interface Organisation {
  name: string;
  url?: string;
  /** ROR id as a URL. */
  ror?: string;
}

export interface Contact {
  name: string;
  email?: string;
  url?: string;
}

export interface Address {
  venue?: string;
  street?: string;
  postalCode?: string;
  locality: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface FeedEvent {
  id: string;
  type: EventType;
  /** `YYYY-MM-DD` (all-day) or `YYYY-MM-DDTHH:MM[:SS]` with `Z` or an offset like `+01:00`. */
  start: string;
  /** Same kind as `start`. For a date, the last day of the event (inclusive). */
  end: string;
  title: Record<EventLocale, string>;
  summary: Record<EventLocale, string>;
  location: string;
  /** The event's own page; without it, `eventUrl()` is its card on the landing page. */
  url?: string;
  registration?: string;
  host: Organisation;
  contact: Contact;
  address?: Address;
  /** Required for `training`, absent otherwise. */
  mode?: Mode;
  /** English; required for `training`. */
  keywords?: string[];
  capacity?: number;
  /** ISO 639-1; `en` when absent. */
  language?: string;
  /** false: left out of events.jsonld (TeSS). */
  tess?: boolean;
}

/** The event's URL: its own page, or its card on the (English) landing page. */
export function eventUrl(event: Pick<FeedEvent, 'id' | 'url'>): string {
  return event.url ?? `${SITE_URL}#${anchorId(event.id)}`;
}

/** The id of the event's element on the page, `event-<id>`; ID_PATTERN makes it a safe fragment. */
export function anchorId(id: string): string {
  return `event-${id}`;
}

export interface When {
  kind: 'date' | 'date-time';
  year: number;
  month: number;
  day: number;
  /** The instant, for a date-time. */
  instant?: number;
}

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function validDay(year: number, month: number, day: number) {
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

/** Parses a `start` or `end` value, or returns undefined if it isn't a real date or date-time. */
export function parseWhen(value: string): When | undefined {
  const date = DATE.exec(value);
  if (date) {
    const [year, month, day] = date.slice(1, 4).map(Number) as [number, number, number];
    return validDay(year, month, day) ? { kind: 'date', year, month, day } : undefined;
  }
  const dateTime = DATE_TIME.exec(value);
  if (!dateTime) return undefined;
  const [year, month, day, hour, minute, second = 0] = dateTime
    .slice(1, 7)
    .map((part) => (part === undefined ? undefined : Number(part))) as number[];
  const offset = dateTime[7] ?? '';
  const offsetOk =
    offset === 'Z' || (Number(offset.slice(1, 3)) <= 14 && Number(offset.slice(4)) < 60);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !validDay(year, month, day) ||
    (hour ?? 99) > 23 ||
    (minute ?? 99) > 59 ||
    second > 59 ||
    !offsetOk
  ) {
    return undefined;
  }
  return { kind: 'date-time', year, month, day, instant: Date.parse(value) };
}

const berlinParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** The instant at which the given day begins in Europe/Berlin (midnight; UTC+1 or UTC+2). */
export function berlinMidnight(year: number, month: number, day: number): number {
  // Date.UTC normalises an overflowing day, for example 32 December to 1 January.
  const utc = Date.UTC(year, month - 1, day);
  const normal = new Date(utc);
  for (const hours of [1, 2]) {
    const instant = utc - hours * 3_600_000;
    const parts = Object.fromEntries(
      berlinParts.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    if (
      Number(parts.year) === normal.getUTCFullYear() &&
      Number(parts.month) === normal.getUTCMonth() + 1 &&
      Number(parts.day) === normal.getUTCDate() &&
      Number(parts.hour) === 0 &&
      Number(parts.minute) === 0
    ) {
      return instant;
    }
  }
  throw new Error(`No midnight in ${TIME_ZONE} on ${year}-${month}-${day}`);
}

/** When the event begins: the instant, or the start of the day in Europe/Berlin. */
export function startInstant(when: When): number {
  return when.instant ?? berlinMidnight(when.year, when.month, when.day);
}

/** When the event is over: the instant, or the end of the last day in Europe/Berlin. */
export function endInstant(when: When): number {
  return when.instant ?? berlinMidnight(when.year, when.month, when.day + 1);
}

/**
 * Checks `start` and `end` together: both must parse, be of the same kind, and `end` must not be
 * before `start`. Returns an error message naming the field, or undefined.
 */
export function checkTimes(event: { start: string; end: string }): string | undefined {
  const start = parseWhen(event.start);
  const end = parseWhen(event.end);
  if (!start) return `start: "${event.start}" is not a real date or date-time with an offset`;
  if (!end) return `end: "${event.end}" is not a real date or date-time with an offset`;
  if (start.kind !== end.kind) {
    return 'end: must be the same kind as start (both dates, or both date-times)';
  }
  if (
    start.kind === 'date'
      ? endInstant(end) <= startInstant(start)
      : endInstant(end) < startInstant(start)
  ) {
    return `end: ${event.end} is before start ${event.start}`;
  }
  return undefined;
}

/** True once the event's end has passed (decision of 2026-11-20, docs/plan.md §1). */
export function isPast(event: FeedEvent, now: number): boolean {
  const end = parseWhen(event.end);
  return !end || endInstant(end) <= now;
}

/** Sort order: by start, then by id. */
export function compareEvents(a: FeedEvent, b: FeedEvent): number {
  const startA = parseWhen(a.start);
  const startB = parseWhen(b.start);
  const diff = (startA ? startInstant(startA) : 0) - (startB ? startInstant(startB) : 0);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** An absolute https: URL without user name or password. */
export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only keys from `allowed`, and every key from `required`. */
function hasKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
) {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function https(value: unknown): value is string {
  return text(value, LIMITS.url) && isHttpsUrl(value);
}

function optional(value: unknown, check: (value: unknown) => boolean) {
  return value === undefined || check(value);
}

function localised(value: unknown, max: number) {
  return (
    isRecord(value) &&
    hasKeys(value, LOCALES, LOCALES) &&
    LOCALES.every((locale) => text(value[locale], max))
  );
}

function isOrganisation(value: unknown) {
  return (
    isRecord(value) &&
    hasKeys(value, ['name'], ['name', 'url', 'ror']) &&
    text(value.name, LIMITS.name) &&
    optional(value.url, https) &&
    optional(value.ror, (ror) => typeof ror === 'string' && ROR_PATTERN.test(ror))
  );
}

function isContact(value: unknown) {
  return (
    isRecord(value) &&
    hasKeys(value, ['name'], ['name', 'email', 'url']) &&
    (value.email !== undefined || value.url !== undefined) &&
    text(value.name, LIMITS.name) &&
    optional(value.email, (email) => text(email, LIMITS.email) && EMAIL_PATTERN.test(email)) &&
    optional(value.url, https)
  );
}

function isAddress(value: unknown) {
  const part = (v: unknown) => text(v, LIMITS.address);
  return (
    isRecord(value) &&
    hasKeys(
      value,
      ['locality', 'country'],
      ['venue', 'street', 'postalCode', 'locality', 'country'],
    ) &&
    optional(value.venue, part) &&
    optional(value.street, part) &&
    optional(value.postalCode, part) &&
    part(value.locality) &&
    typeof value.country === 'string' &&
    COUNTRY_PATTERN.test(value.country)
  );
}

/** A keyword list: 1 to 10 texts without commas, unique ignoring case. */
export function isKeywordList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.keywords) return false;
  const seen = new Set<string>();
  for (const keyword of value) {
    if (!text(keyword, LIMITS.keyword) || keyword.includes(',')) return false;
    const key = keyword.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

const REQUIRED_KEYS = [
  'id',
  'type',
  'start',
  'end',
  'title',
  'summary',
  'location',
  'host',
  'contact',
] as const;
const EVENT_KEYS = [
  ...REQUIRED_KEYS,
  'url',
  'registration',
  'address',
  'mode',
  'keywords',
  'capacity',
  'language',
  'tess',
] as const;

/**
 * The browser's check of one entry of events.json, the same rules as `#/$defs/event` in
 * events/events.schema.json plus `checkTimes`. Everything that comes from the feed is untrusted.
 */
export function isFeedEvent(value: unknown): value is FeedEvent {
  if (!isRecord(value) || !hasKeys(value, REQUIRED_KEYS, EVENT_KEYS)) return false;
  const training = value.type === 'training';
  return (
    text(value.id, LIMITS.id) &&
    ID_PATTERN.test(value.id) &&
    (EVENT_TYPES as readonly unknown[]).includes(value.type) &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    localised(value.title, LIMITS.title) &&
    localised(value.summary, LIMITS.summary) &&
    text(value.location, LIMITS.location) &&
    optional(value.url, https) &&
    optional(value.registration, https) &&
    isOrganisation(value.host) &&
    isContact(value.contact) &&
    optional(value.address, isAddress) &&
    (training ? (MODES as readonly unknown[]).includes(value.mode) : value.mode === undefined) &&
    (training ? isKeywordList(value.keywords) : optional(value.keywords, isKeywordList)) &&
    optional(
      value.capacity,
      (c) => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= LIMITS.capacity,
    ) &&
    optional(value.language, (l) => typeof l === 'string' && LANGUAGE_PATTERN.test(l)) &&
    optional(value.tess, (t) => typeof t === 'boolean') &&
    checkTimes({ start: value.start, end: value.end }) === undefined
  );
}

/**
 * The upcoming events of a parsed events.json: valid entries whose end hasn't passed, sorted.
 * Anything that isn't a feed of the current schema version gives an empty list.
 */
export function upcomingEvents(feed: unknown, now: number): FeedEvent[] {
  if (!isRecord(feed) || feed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(feed.events)) {
    return [];
  }
  return feed.events
    .filter(isFeedEvent)
    .filter((event) => !isPast(event, now))
    .sort(compareEvents);
}
