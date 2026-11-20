// Validates the events in events/*.yaml and builds events.json, the feed the landing page reads at
// runtime, and events.jsonld, the Bioschemas markup of the same events that ELIXIR TeSS harvests
// (docs/plan.md §4).
//
//   node scripts/build-events.mjs --check                validate only (`pnpm events:check`)
//   node scripts/build-events.mjs [--out <file>] [--out-jsonld <file>]
//                                                        validate and write both (`pnpm events:build`)
//   node scripts/build-events.mjs --check-feed <file>    validate an events.json, e.g. the release asset
//   node scripts/build-events.mjs --check-jsonld <file>  validate an events.jsonld
//
// Further options: `--dir <dir>` reads event files from another directory (tests use fixtures);
// `--now <date-time>` sets the moment that decides which events are past (default: now).
//
// Each event file is checked against events/events.schema.json with Ajv, and then against the rules
// a schema can't express: real calendar dates, `end` not before `start` (src/lib/events.ts), the id
// equals the file name, ids are unique, and keywords are unique ignoring case. Files whose name
// starts with "_" (the template) are skipped. The feed holds the events that aren't past, sorted by
// start and then id. events.jsonld holds the same events minus those with `tess: false`, built by
// src/lib/event-jsonld.ts and checked against the Bioschemas profiles
// (scripts/lib/event-profiles.mjs).
//
// The functions are exported so tests can call them without the file system.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseDocument } from 'yaml';
import { eventsJsonLd } from '../src/lib/event-jsonld.ts';
import { serializeJsonLd } from '../src/lib/jsonld.ts';
import {
  checkTimes,
  compareEvents,
  EVENT_TYPES,
  isFeedEvent,
  isKeywordList,
  isPast,
  LIMITS,
  MODES,
  SCHEMA_VERSION,
} from '../src/lib/events.ts';
import { checkEventsJsonLd } from './lib/event-profiles.mjs';

const ROOT = join(import.meta.dirname, '..');
export const SCHEMA_PATH = join(ROOT, 'events', 'events.schema.json');
export const DEFAULT_DIR = join(ROOT, 'events');
/** Git-ignored. */
export const DEFAULT_OUT = join(ROOT, '.cache', 'events', 'events.json');
/** Git-ignored. */
export const DEFAULT_OUT_JSONLD = join(ROOT, '.cache', 'events', 'events.jsonld');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(schema);
const validateEventSchema = ajv.getSchema(`${schema.$id}#/$defs/event`);
const validateFeedSchema = ajv.getSchema(`${schema.$id}#/$defs/feed`);
if (!validateEventSchema || !validateFeedSchema)
  throw new Error('Cannot compile the events schema');

// src/lib/events.ts repeats the schema's limits and enums for the browser; keep the two in step.
const defs = schema.$defs;
const props = defs.event.properties;
const schemaLimits = {
  id: props.id.maxLength,
  title: props.title.properties.en.maxLength,
  summary: props.summary.properties.en.maxLength,
  location: props.location.maxLength,
  url: defs.httpsUrl.maxLength,
  name: props.host.properties.name.maxLength,
  email: props.contact.properties.email.maxLength,
  ror: props.host.properties.ror.maxLength,
  address: props.address.properties.locality.maxLength,
  keyword: props.keywords.items.maxLength,
  keywords: props.keywords.maxItems,
  capacity: props.capacity.maximum,
};
const sameLimits = [
  [props.title.properties.de.maxLength, props.title.properties.en.maxLength],
  [props.summary.properties.de.maxLength, props.summary.properties.en.maxLength],
  [props.contact.properties.name.maxLength, props.host.properties.name.maxLength],
  ...['venue', 'street', 'postalCode'].map((part) => [
    props.address.properties[part].maxLength,
    props.address.properties.locality.maxLength,
  ]),
];
if (sameLimits.some(([a, b]) => a !== b)) {
  throw new Error('events.schema.json: limits that src/lib/events.ts shares differ');
}
for (const [field, max] of Object.entries(LIMITS)) {
  const inSchema = schemaLimits[/** @type {keyof typeof schemaLimits} */ (field)];
  if (inSchema !== max) {
    throw new Error(
      `LIMITS.${field} in src/lib/events.ts (${max}) differs from the schema (${inSchema})`,
    );
  }
}
if (Object.keys(schemaLimits).length !== Object.keys(LIMITS).length) {
  throw new Error('LIMITS in src/lib/events.ts and the schema name different fields');
}
for (const [name, list, inSchema] of [
  ['EVENT_TYPES', EVENT_TYPES, props.type.enum],
  ['MODES', MODES, props.mode.enum],
]) {
  if (JSON.stringify(list) !== JSON.stringify(inSchema)) {
    throw new Error(`${name} in src/lib/events.ts differs from the schema's enum`);
  }
}

/** Readable messages for `pattern` errors, by the last part of the field path. */
const PATTERN_MESSAGES = {
  id: 'must be lowercase letters and digits, separated by single hyphens',
  start: 'must be a date YYYY-MM-DD or a date-time YYYY-MM-DDTHH:MM[:SS] with Z or an offset',
  end: 'must be a date YYYY-MM-DD or a date-time YYYY-MM-DDTHH:MM[:SS] with Z or an offset',
  url: 'must be an https:// URL without spaces, user name or password',
  registration: 'must be an https:// URL without spaces, user name or password',
  ror: 'must be a ROR id URL like https://ror.org/01vmpm840',
  email: 'must be an email address',
  country: 'must be an ISO 3166-1 alpha-2 code in capitals, for example DE',
  language: 'must be an ISO 639-1 code in lowercase, for example en',
};

/** Ajv's errors as `field.path: message` lines. */
function formatErrors(errors) {
  return (errors ?? [])
    .map((error) => {
      const path = error.instancePath.slice(1).replaceAll('/', '.');
      const at = (field) => (path ? `${path}.${field}` : field);
      const parts = path.split('.');
      // A keyword is `keywords.<n>`; a URL inside host or contact is `host.url`.
      const last = /^\d+$/.test(parts.at(-1) ?? '') ? parts.at(-2) : parts.at(-1);
      switch (error.keyword) {
        case 'required':
          return `${at(error.params.missingProperty)}: is required`;
        case 'additionalProperties':
          return `${at(error.params.additionalProperty)}: unknown field`;
        case 'pattern':
          if (last === 'keywords' && error.params.pattern === '^[^,]*$') {
            return `${path}: must not contain a comma; give each keyword as its own list item`;
          }
          return `${path}: ${PATTERN_MESSAGES[last ?? ''] ?? 'must not be empty or blank'}`;
        case 'enum':
          return `${path}: must be one of ${error.params.allowedValues.join(', ')}`;
        case 'minProperties':
          return `${path}: needs an email or a url as well as the name`;
        case 'not':
          return `${path || '(file)'}: mode is only allowed for type training`;
        case 'if':
          return null;
        default:
          return `${path || '(file)'}: ${error.message}`;
      }
    })
    .filter((line) => line !== null);
}

/**
 * Parses the text of an event file: YAML 1.2 core schema, unique keys, no custom tags, one
 * document. Returns `{ data }` or `{ errors }`.
 */
export function parseEventYaml(text) {
  const doc = parseDocument(text, {
    schema: 'core',
    customTags: [],
    uniqueKeys: true,
    strict: true,
    prettyErrors: true,
  });
  const problems = [...doc.errors, ...doc.warnings].map((e) => `YAML: ${e.message.split('\n')[0]}`);
  if (problems.length > 0) return { errors: problems };
  return { data: doc.toJS({ maxAliasCount: 0 }) };
}

/** Checks one parsed event. `fileName` is the base name, for example `bhde26.yaml`. */
export function validateEvent(data, fileName) {
  if (!validateEventSchema(data)) return formatErrors(validateEventSchema.errors);
  const errors = [];
  const times = checkTimes(data);
  if (times) errors.push(times);
  const expected = fileName.replace(/\.yaml$/, '');
  if (data.id !== expected) errors.push(`id: "${data.id}" must equal the file name "${expected}"`);
  if (data.keywords !== undefined && !isKeywordList(data.keywords)) {
    errors.push('keywords: must be unique, ignoring case');
  }
  // Same rules as the browser, so the feed never holds an event the page would drop.
  if (errors.length === 0 && !isFeedEvent(data)) errors.push('(file): rejected by isFeedEvent');
  return errors;
}

/**
 * Validates event files given as `{ name, text }` (base names). Files starting with "_" are
 * skipped, and anything but `.yaml` is an error. Returns the valid events and errors as
 * `file: field: message` lines.
 */
export function validateEventFiles(files) {
  const events = [];
  const errors = [];
  const seen = new Map();
  for (const { name, text } of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (name.startsWith('_') || name === 'events.schema.json') continue;
    const file = `events/${name}`;
    if (!name.endsWith('.yaml')) {
      errors.push(`${file}: only .yaml event files belong in events/`);
      continue;
    }
    const parsed = parseEventYaml(text);
    const problems = parsed.errors ?? validateEvent(parsed.data, name);
    if (problems.length > 0) {
      errors.push(...problems.map((p) => `${file}: ${p}`));
      continue;
    }
    const other = seen.get(parsed.data.id);
    if (other) {
      errors.push(`${file}: id: "${parsed.data.id}" is already used by ${other}`);
      continue;
    }
    seen.set(parsed.data.id, file);
    events.push(parsed.data);
  }
  return { events, errors };
}

/** The feed: events whose end hasn't passed at `now` (ms), sorted by start and then id. */
export function buildFeed(events, now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    events: events.filter((event) => !isPast(event, now)).sort(compareEvents),
  };
}

/** Checks a parsed events.json; returns error lines. */
export function validateFeed(feed) {
  if (!validateFeedSchema(feed)) return formatErrors(validateFeedSchema.errors);
  const errors = [];
  const ids = new Set();
  feed.events.forEach((event, index) => {
    const times = checkTimes(event);
    if (times) errors.push(`events.${index}.${times}`);
    if (ids.has(event.id)) errors.push(`events.${index}.id: duplicate "${event.id}"`);
    ids.add(event.id);
  });
  for (let i = 1; i < feed.events.length; i++) {
    if (compareEvents(feed.events[i - 1], feed.events[i]) > 0) {
      errors.push(`events.${i}: not sorted by start and id`);
    }
  }
  return errors;
}

/**
 * events.jsonld for the events of a feed (upcoming, sorted), as the text that is published: the
 * document of src/lib/event-jsonld.ts, pretty-printed by serializeJsonLd (every `<` escaped). It
 * starts with `{`, which is how TeSS recognises JSON-LD. Throws if the document fails
 * checkEventsJsonLd.
 */
export function buildJsonLd(feed) {
  const doc = eventsJsonLd(feed.events);
  const problems = checkEventsJsonLd(doc);
  if (problems.length > 0) throw new Error(`events.jsonld:\n${problems.join('\n')}`);
  return `${serializeJsonLd(doc, 2)}\n`;
}

/** Checks the text of an events.jsonld; returns error lines. */
export function validateJsonLdText(text) {
  if (!text.startsWith('{')) return ['(document): must start with "{" (TeSS reads it as JSON-LD)'];
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    return [`(document): ${error instanceof Error ? error.message : String(error)}`];
  }
  return checkEventsJsonLd(doc);
}

function readEventFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, text: readFileSync(join(dir, entry.name), 'utf8') }));
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function main() {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      'check-feed': { type: 'string' },
      'check-jsonld': { type: 'string' },
      dir: { type: 'string', default: DEFAULT_DIR },
      out: { type: 'string', default: DEFAULT_OUT },
      'out-jsonld': { type: 'string', default: DEFAULT_OUT_JSONLD },
      now: { type: 'string' },
    },
    strict: true,
  });

  if (values['check-feed']) {
    const file = values['check-feed'];
    let feed;
    try {
      feed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      fail([`${file}: ${error instanceof Error ? error.message : String(error)}`]);
    }
    const errors = validateFeed(feed);
    if (errors.length > 0) fail(errors.map((e) => `${file}: ${e}`));
    console.log(`${file}: valid, ${feed.events.length} event(s)`);
    return;
  }

  if (values['check-jsonld']) {
    const file = values['check-jsonld'];
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      fail([`${file}: ${error instanceof Error ? error.message : String(error)}`]);
    }
    const errors = validateJsonLdText(text);
    if (errors.length > 0) fail(errors.map((e) => `${file}: ${e}`));
    console.log(`${file}: valid, ${JSON.parse(text)['@graph'].length} node(s)`);
    return;
  }

  const now = values.now === undefined ? Date.now() : Date.parse(values.now);
  if (Number.isNaN(now)) fail([`--now: "${values.now}" is not a date-time`]);

  const { events, errors } = validateEventFiles(readEventFiles(values.dir));
  if (errors.length > 0) fail(errors);
  if (values.check) {
    console.log(`${basename(values.dir)}/: ${events.length} valid event(s)`);
    return;
  }

  const feed = buildFeed(events, now);
  const feedErrors = validateFeed(feed);
  if (feedErrors.length > 0) fail(feedErrors);
  let jsonld;
  try {
    jsonld = buildJsonLd(feed);
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(feed, null, 2)}\n`);
  console.log(
    `Wrote ${values.out}: ${feed.events.length} upcoming of ${events.length} event(s)` +
      (feed.events.length > 0 ? ` (${feed.events.map((e) => e.id).join(', ')})` : ''),
  );
  mkdirSync(dirname(values['out-jsonld']), { recursive: true });
  writeFileSync(values['out-jsonld'], jsonld);
  const forTess = feed.events.filter((e) => e.tess !== false).map((e) => e.id);
  console.log(
    `Wrote ${values['out-jsonld']}: ${forTess.length} event(s) for TeSS` +
      (forTess.length > 0 ? ` (${forTess.join(', ')})` : ''),
  );
}

if (import.meta.main) main();
