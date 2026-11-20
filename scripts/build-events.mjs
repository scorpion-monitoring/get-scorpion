// Validates the events in events/*.yaml and builds events.json, the feed the landing page reads at
// runtime (docs/plan.md §4).
//
//   node scripts/build-events.mjs --check              validate only (`pnpm events:check`)
//   node scripts/build-events.mjs [--out <file>]       validate and write the feed (`pnpm events:build`)
//   node scripts/build-events.mjs --check-feed <file>  validate an events.json, e.g. the release asset
//
// Further options: `--dir <dir>` reads event files from another directory (tests use fixtures);
// `--now <date-time>` sets the moment that decides which events are past (default: now).
//
// Each event file is checked against events/events.schema.json with Ajv, and then against the rules
// a schema can't express: real calendar dates, `end` not before `start` (src/lib/events.ts), the id
// equals the file name, and ids are unique. Files whose name starts with "_" (the template) are
// skipped. The feed holds the events that aren't past, sorted by start and then id.
//
// The functions are exported so tests can call them without the file system.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseDocument } from 'yaml';
import {
  checkTimes,
  compareEvents,
  isFeedEvent,
  isPast,
  LIMITS,
  SCHEMA_VERSION,
} from '../src/lib/events.ts';

const ROOT = join(import.meta.dirname, '..');
export const SCHEMA_PATH = join(ROOT, 'events', 'events.schema.json');
export const DEFAULT_DIR = join(ROOT, 'events');
/** Git-ignored. */
export const DEFAULT_OUT = join(ROOT, '.cache', 'events', 'events.json');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(schema);
const validateEventSchema = ajv.getSchema(`${schema.$id}#/$defs/event`);
const validateFeedSchema = ajv.getSchema(`${schema.$id}#/$defs/feed`);
if (!validateEventSchema || !validateFeedSchema)
  throw new Error('Cannot compile the events schema');

// src/lib/events.ts repeats the schema's limits for the browser; keep the two in step.
const props = schema.$defs.event.properties;
const schemaLimits = {
  id: props.id.maxLength,
  title: props.title.properties.en.maxLength,
  summary: props.summary.properties.en.maxLength,
  location: props.location.maxLength,
  url: props.url.maxLength,
};
for (const [field, max] of Object.entries(LIMITS)) {
  const inSchema = schemaLimits[/** @type {keyof typeof schemaLimits} */ (field)];
  if (
    inSchema !== max ||
    props[field]?.properties?.de?.maxLength !== props[field]?.properties?.en?.maxLength
  ) {
    throw new Error(
      `LIMITS.${field} in src/lib/events.ts (${max}) differs from the schema (${inSchema})`,
    );
  }
}

/** Readable messages for `pattern` errors, by the last part of the field path. */
const PATTERN_MESSAGES = {
  id: 'must be lowercase letters and digits, separated by single hyphens',
  start: 'must be a date YYYY-MM-DD or a date-time YYYY-MM-DDTHH:MM[:SS] with Z or an offset',
  end: 'must be a date YYYY-MM-DD or a date-time YYYY-MM-DDTHH:MM[:SS] with Z or an offset',
  url: 'must be an https:// URL without spaces, user name or password',
};

/** Ajv's errors as `field.path: message` lines. */
function formatErrors(errors) {
  return (errors ?? []).map((error) => {
    const path = error.instancePath.slice(1).replaceAll('/', '.');
    const at = (field) => (path ? `${path}.${field}` : field);
    const last = path.split('.').at(-1) ?? '';
    switch (error.keyword) {
      case 'required':
        return `${at(error.params.missingProperty)}: is required`;
      case 'additionalProperties':
        return `${at(error.params.additionalProperty)}: unknown field`;
      case 'pattern':
        return `${path}: ${PATTERN_MESSAGES[last] ?? 'must not be empty or blank'}`;
      default:
        return `${path || '(file)'}: ${error.message}`;
    }
  });
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
      dir: { type: 'string', default: DEFAULT_DIR },
      out: { type: 'string', default: DEFAULT_OUT },
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
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(feed, null, 2)}\n`);
  console.log(
    `Wrote ${values.out}: ${feed.events.length} upcoming of ${events.length} event(s)` +
      (feed.events.length > 0 ? ` (${feed.events.map((e) => e.id).join(', ')})` : ''),
  );
}

if (import.meta.main) main();
