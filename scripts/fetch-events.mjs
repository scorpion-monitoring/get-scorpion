// The events fetcher (docs/plan.md §4, "Deliver"): runs as a sidecar next to the web container and
// keeps <dir>/events.json and <dir>/events.jsonld current from the `events` release, every 15 minutes.
// Each file is checked and replaced atomically and on its own. On a 404, a network error or an invalid
// file the last good file stays: the release URL can answer with a cached 404 for a few minutes (§4).
//
//   node scripts/fetch-events.mjs --dir /srv/events [--interval 900] [--once] [--base <url>]
//
// It imports only src/lib/events.ts (no dependencies), so the sidecar image needs no node_modules.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isFeedEvent, SCHEMA_VERSION } from '../src/lib/events.ts';

export const RELEASE_BASE =
  'https://github.com/scorpion-monitoring/get-scorpion/releases/download/events/';
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 30_000;

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks an events.json text. Returns an error message, or undefined if it is a valid feed. */
export function checkFeed(text) {
  let feed;
  try {
    feed = JSON.parse(text);
  } catch {
    return 'not JSON';
  }
  if (!isRecord(feed)) return 'not an object';
  const keys = Object.keys(feed).sort().join(',');
  if (keys !== 'events,schemaVersion') return `unexpected fields: ${keys}`;
  if (feed.schemaVersion !== SCHEMA_VERSION) return `schemaVersion ${feed.schemaVersion}`;
  if (!Array.isArray(feed.events)) return 'events is not a list';
  const bad = feed.events.findIndex((event) => !isFeedEvent(event));
  if (bad !== -1) return `event ${bad} is invalid`;
  return undefined;
}

/** Checks an events.jsonld text: a JSON object with only @context and a @graph list (§4). */
export function checkJsonLd(text) {
  if (!text.startsWith('{')) return 'does not start with {';
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return 'not JSON';
  }
  if (!isRecord(doc)) return 'not an object';
  const keys = Object.keys(doc).sort().join(',');
  if (keys !== '@context,@graph') return `unexpected fields: ${keys}`;
  if (!Array.isArray(doc['@graph'])) return '@graph is not a list';
  return undefined;
}

const FILES = [
  { name: 'events.json', check: checkFeed },
  { name: 'events.jsonld', check: checkJsonLd },
];

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) throw new Error(`too large (${length} bytes)`);
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('too large');
  return text;
}

/** Fetches, checks and installs one file. Returns 'updated', 'unchanged' or 'kept' (last good file). */
export async function updateFile(dir, base, { name, check }, log = console) {
  let text;
  try {
    text = await download(new URL(name, base).href);
  } catch (error) {
    log.warn(`${name}: kept the last good file (${error.message})`);
    return 'kept';
  }
  const problem = check(text);
  if (problem) {
    log.warn(`${name}: kept the last good file (invalid: ${problem})`);
    return 'kept';
  }
  const target = join(dir, name);
  const current = await readFile(target, 'utf8').catch(() => undefined);
  if (current === text) return 'unchanged';
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, text, { mode: 0o644 });
  await rename(temp, target);
  log.info(`${name}: updated (${Buffer.byteLength(text)} bytes)`);
  return 'updated';
}

export async function updateAll(dir, base, log = console) {
  return Promise.all(FILES.map((file) => updateFile(dir, base, file, log)));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: '/srv/events' },
      interval: { type: 'string', default: '900' },
      base: { type: 'string', default: RELEASE_BASE },
      once: { type: 'boolean', default: false },
    },
  });
  const interval = Number(values.interval);
  if (!Number.isInteger(interval) || interval < 60)
    throw new Error('--interval: at least 60 seconds');
  if (!values.base.startsWith('https://') && !values.base.startsWith('http://127.0.0.1')) {
    throw new Error('--base: https only');
  }
  await updateAll(values.dir, values.base);
  if (!values.once) {
    const timer = setInterval(() => void updateAll(values.dir, values.base), interval * 1000);
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.on(signal, () => {
        clearInterval(timer);
        process.exit(0);
      });
    }
  }
}
