// Fetches the build-time inputs from the application release pinned in scorpion-release.json
// (docs/plan.md §3) into the git-ignored src/assets/generated/:
//
// - docs-export.json: the Scorpion version, for the release line in the hero and the footer;
// - screenshots.json and screenshots/<journey>/<slug>.{light,dark}.png: the screenshots that
//   src/data/screenshots.yaml maps to feature cards, and nothing else from the zip;
// - badges/*.svg and badges.json: the OpenSSF badges of the application repo (§6).
//
// `pnpm build` and `pnpm dev` run this first. `pnpm check` does not need it: nothing that
// `astro check` type-checks imports a generated file (src/lib/generated.ts reads them through
// import.meta.glob, which is empty until this script has run).
//
// The zip is untrusted input. It is downloaded without a token and with a size limit, and its
// sha256 must match scorpion-release.json before it is opened. Entries are checked (names, types,
// count, sizes), and only the files named above are read. The output paths are built from our own
// validated data, never from names in the zip. A verified zip is cached in
// node_modules/.cache/get-scorpion/, keyed by its hash, so a second run doesn't download it again.
//
// A badge that can't be downloaded or doesn't pass the checks is not a build failure: the script
// warns, and the page shows a plain text link instead (decision of 2026-11-20, §12.10).
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import yauzl from 'yauzl';

const root = fileURLToPath(new URL('..', import.meta.url));

export const RELEASE_FILE = join(root, 'scorpion-release.json');
const SCREENSHOTS_FILE = join(root, 'src/data/screenshots.yaml');
const OUT_DIR = join(root, 'src/assets/generated');
const CACHE_DIR = join(root, 'node_modules/.cache/get-scorpion');

export const REPO = 'scorpion-monitoring/scorpion';
export const ASSET_NAME = 'docs-export.zip';

const MiB = 1024 * 1024;

/** Limits for the zip. v0.16.1: 3.9 MB, 65 entries, 4.6 MB uncompressed. */
export const ZIP_LIMITS = {
  zipBytes: 20 * MiB,
  entries: 1000,
  totalUncompressed: 100 * MiB,
  entryBytes: 10 * MiB,
};

const BADGE_BYTES = 16 * 1024;

const BADGES = [
  {
    id: 'bestPractices',
    file: 'best-practices.svg',
    url: 'https://www.bestpractices.dev/projects/15237/badge',
    // The level as the badge states it: passing, silver, gold or "in progress NN%".
    parse: (label) => {
      const match = /^openssf best practices: (passing|silver|gold|in progress (\d{1,2})%)$/.exec(
        label,
      );
      if (!match) return undefined;
      return match[2] === undefined
        ? { level: match[1] }
        : { level: 'in_progress', percent: Number(match[2]) };
    },
  },
  {
    id: 'scorecard',
    file: 'scorecard.svg',
    // Redirects to img.shields.io; only the downloaded file is served.
    url: `https://api.scorecard.dev/projects/github.com/${REPO}/badge`,
    parse: (label) => {
      const match = /^openssf scorecard: (\d{1,2}(?:\.\d)?)$/.exec(label);
      const score = match ? Number(match[1]) : NaN;
      return score >= 0 && score <= 10 ? { score } : undefined;
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Inputs

const TAG = /^v(\d+\.\d+\.\d+)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Reads and validates scorpion-release.json: exactly `{ tag, sha256 }`. */
export async function readRelease(file = RELEASE_FILE) {
  const release = JSON.parse(await readFile(file, 'utf8'));
  return validateRelease(release, file);
}

export function validateRelease(release, file = 'scorpion-release.json') {
  const keys = release && typeof release === 'object' ? Object.keys(release).sort() : [];
  if (keys.join() !== 'sha256,tag') {
    throw new Error(`${file} must be exactly { "tag": "vX.Y.Z", "sha256": "…" }`);
  }
  if (typeof release.tag !== 'string' || !TAG.test(release.tag)) {
    throw new Error(`${file}: "tag" must look like v1.2.3, got ${JSON.stringify(release.tag)}`);
  }
  if (typeof release.sha256 !== 'string' || !SHA256.test(release.sha256)) {
    throw new Error(`${file}: "sha256" must be 64 lowercase hex characters`);
  }
  return { tag: release.tag, version: TAG.exec(release.tag)[1], sha256: release.sha256 };
}

const JOURNEY = /^j\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reads the journey/slug pairs from src/data/screenshots.yaml. The full schema (including the alt
 * text key) is checked by the content collection; this checks what the paths are built from.
 */
async function readScreenshotMap() {
  const data = parseYaml(await readFile(SCREENSHOTS_FILE, 'utf8'), { uniqueKeys: true });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('src/data/screenshots.yaml must be a map from feature card id to fields');
  }
  return Object.entries(data).map(([card, entry]) => {
    if (!JOURNEY.test(entry?.journey ?? '') || !SLUG.test(entry?.slug ?? '')) {
      throw new Error(
        `src/data/screenshots.yaml: "${card}" needs a journey like j07 and a slug like service-after-edit`,
      );
    }
    return { card, journey: entry.journey, slug: entry.slug };
  });
}

// ---------------------------------------------------------------------------------------------
// Download

/**
 * Downloads an https URL into memory, following redirects, with no credentials and at most
 * `maxBytes`. Returns the body and the response headers. `token` is only for the GitHub API (see
 * githubApi()); a request with a token follows no redirect, so the token goes nowhere else.
 */
export async function download(url, { maxBytes, timeoutMs = 60_000, accept, token } = {}) {
  if (!url.startsWith('https://')) throw new Error(`Refusing to download a non-https URL: ${url}`);
  if (token && !url.startsWith('https://api.github.com/')) {
    throw new Error(`Refusing to send a token to ${url}`);
  }
  const response = await fetch(url, {
    redirect: token ? 'error' : 'follow',
    credentials: 'omit',
    headers: {
      'user-agent': 'get-scorpion-build',
      ...(accept ? { accept } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.url.startsWith('https://')) {
    throw new Error(`${url} redirected to a non-https URL`);
  }
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`${url}: ${declared} bytes is over ${maxBytes}`);

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`${url}: more than ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return { body: Buffer.concat(chunks), headers: response.headers };
}

/**
 * GETs a GitHub REST API path (`/repos/…`) and parses the JSON. Uses GITHUB_TOKEN when it is set,
 * as in the workflows: without a token the API allows 60 requests an hour per IP address, which
 * GitHub's shared runners can use up (an Upstream run failed with 403 on 2026-11-23). Locally it
 * works without one.
 */
export async function githubApi(path) {
  const { body } = await download(`https://api.github.com${path}`, {
    maxBytes: 1024 * 1024,
    accept: 'application/vnd.github+json',
    token: process.env.GITHUB_TOKEN || undefined,
  });
  return JSON.parse(body.toString('utf8'));
}

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export const assetUrl = (tag) =>
  `https://github.com/${REPO}/releases/download/${tag}/${ASSET_NAME}`;

const cachePath = (hash) => join(CACHE_DIR, `docs-export-${hash}.zip`);

/** Writes a verified zip to the cache, atomically. */
export async function cacheZip(hash, buffer) {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${cachePath(hash)}.${process.pid}.tmp`;
  await writeFile(tmp, buffer);
  await rename(tmp, cachePath(hash));
}

/** Returns the zip for the release, from the cache or downloaded, after checking its sha256. */
async function getZip({ tag, sha256: expected }) {
  try {
    const cached = await readFile(cachePath(expected));
    if (sha256(cached) === expected) {
      console.log(`docs export: using the cached ${ASSET_NAME} of ${tag}`);
      return cached;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const url = assetUrl(tag);
  console.log(`docs export: downloading ${url}`);
  const { body } = await download(url, { maxBytes: ZIP_LIMITS.zipBytes });
  const actual = sha256(body);
  if (actual !== expected) {
    throw new Error(
      `${ASSET_NAME} of ${tag} has sha256 ${actual}, but scorpion-release.json pins ${expected}. ` +
        'If the release was replaced on purpose, run `pnpm bump-release`; otherwise do not build.',
    );
  }
  await cacheZip(expected, body);
  return body;
}

// ---------------------------------------------------------------------------------------------
// Zip extraction (untrusted input)

// One or more path segments of safe characters, none of them "." or "..", no leading slash.
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*\/?$/;
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const MSDOS_DIRECTORY = 0x10;

function checkEntry(entry, limits) {
  const name = entry.fileName;
  if (name.length > 255 || !SAFE_NAME.test(name) || name.split('/').includes('..')) {
    throw new Error(`Unsafe entry name in the zip: ${JSON.stringify(name)}`);
  }
  if (entry.isEncrypted()) throw new Error(`Encrypted entry in the zip: ${name}`);
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`Unsupported compression method ${entry.compressionMethod}: ${name}`);
  }
  const isDirectory = name.endsWith('/');
  // On Unix-made archives the upper 16 bits of the external attributes hold st_mode. Anything but
  // a regular file (or a directory entry for a name ending in "/") is rejected: symlinks, devices,
  // FIFOs, sockets.
  const madeOnUnix = entry.versionMadeBy >> 8 === 3;
  const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
  if (madeOnUnix && mode !== 0 && mode !== (isDirectory ? S_IFDIR : S_IFREG)) {
    throw new Error(`Entry in the zip is not a regular file: ${name} (mode ${mode.toString(8)})`);
  }
  if (!isDirectory && entry.externalFileAttributes & MSDOS_DIRECTORY) {
    throw new Error(`Entry in the zip is marked as a directory: ${name}`);
  }
  if (isDirectory && entry.uncompressedSize !== 0) {
    throw new Error(`Directory entry with data in the zip: ${name}`);
  }
  if (entry.uncompressedSize > limits.entryBytes) {
    throw new Error(`Entry in the zip is too large: ${name} (${entry.uncompressedSize} bytes)`);
  }
  return isDirectory;
}

async function readStream(stream, maxBytes, name) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`Entry in the zip is too large: ${name}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Checks every entry of a zip held in memory and returns the contents of the `wanted` names.
 * Fails on: more than `limits.entries` entries, a declared total uncompressed size over
 * `limits.totalUncompressed`, an entry over `limits.entryBytes`, names with "..", a leading "/",
 * a drive letter, a backslash or other unexpected characters, duplicate names, symlinks and other
 * non-regular files, encrypted entries, unknown compression, and a wanted name that is missing.
 * yauzl itself checks that each entry's actual size matches its declared size.
 *
 * @param {Buffer} buffer
 * @param {Iterable<string>} wanted
 * @returns {Promise<Map<string, Buffer>>}
 */
export async function extractEntries(buffer, wanted, limits = ZIP_LIMITS) {
  if (buffer.length > limits.zipBytes) throw new Error('The zip is too large');
  const want = new Set(wanted);
  const zip = await yauzl.fromBufferPromise(buffer, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  try {
    if (zip.entryCount > limits.entries) {
      throw new Error(`The zip has ${zip.entryCount} entries, more than ${limits.entries}`);
    }
    const seen = new Set();
    const found = new Map();
    let total = 0;
    for await (const entry of zip.eachEntry()) {
      const isDirectory = checkEntry(entry, limits);
      if (seen.has(entry.fileName)) {
        throw new Error(`Duplicate entry in the zip: ${entry.fileName}`);
      }
      seen.add(entry.fileName);
      total += entry.uncompressedSize;
      if (total > limits.totalUncompressed) {
        throw new Error(`The zip's uncompressed size is over ${limits.totalUncompressed} bytes`);
      }
      if (isDirectory || !want.has(entry.fileName)) continue;
      const stream = await zip.openReadStreamPromise(entry);
      found.set(entry.fileName, await readStream(stream, limits.entryBytes, entry.fileName));
    }
    const missing = [...want].filter((name) => !found.has(name));
    if (missing.length > 0) throw new Error(`Missing from the zip: ${missing.join(', ')}`);
    return found;
  } finally {
    if (zip.isOpen) zip.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Contents

function parseJson(buffer, name) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error(`${name} in the docs export is not valid JSON: ${error.message}`, {
      cause: error,
    });
  }
}

/** Checks docs-export.json: schema version 1, and the version of the pinned tag. */
export function checkDocsExport(data, version) {
  if (data?.schemaVersion !== 1) {
    throw new Error(
      `docs-export.json has schemaVersion ${JSON.stringify(data?.schemaVersion)}; this script ` +
        'knows version 1. Check what changed upstream before updating it.',
    );
  }
  if (data.scorpionVersion !== version) {
    throw new Error(
      `docs-export.json says scorpionVersion ${JSON.stringify(data.scorpionVersion)}, but ` +
        `scorpion-release.json pins v${version}`,
    );
  }
  return { schemaVersion: 1, scorpionVersion: version };
}

const SCREENSHOT_PATH = /^screenshots\/(j\d{2})\/[A-Za-z0-9._-]+\.(light|dark)\.png$/;

/** Finds the screenshot pair for each mapped journey/slug in screenshots.json. */
function resolveScreenshots(list, mapping) {
  if (!Array.isArray(list)) throw new Error('screenshots.json in the docs export is not an array');
  return mapping.map(({ card, journey, slug }) => {
    const matches = list.filter((s) => s?.journey === journey && s?.slug === slug);
    if (matches.length !== 1) {
      throw new Error(
        `src/data/screenshots.yaml maps "${card}" to ${journey}/${slug}, which ` +
          (matches.length === 0
            ? 'is not in screenshots.json of the docs export (renamed or removed upstream?)'
            : 'appears more than once in screenshots.json'),
      );
    }
    const [shot] = matches;
    for (const variant of ['light', 'dark']) {
      const match = SCREENSHOT_PATH.exec(shot[variant] ?? '');
      if (!match || match[1] !== journey || match[2] !== variant) {
        throw new Error(`screenshots.json: unexpected ${variant} path for ${journey}/${slug}`);
      }
    }
    return { card, journey, slug, light: shot.light, dark: shot.dark };
  });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function checkPng(buffer, name) {
  const ok =
    buffer.length > 24 &&
    buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buffer.toString('latin1', 12, 16) === 'IHDR';
  const width = ok ? buffer.readUInt32BE(16) : 0;
  const height = ok ? buffer.readUInt32BE(20) : 0;
  if (!ok || width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new Error(`${name} in the docs export is not a PNG of a plausible size`);
  }
}

// ---------------------------------------------------------------------------------------------
// Badges

/**
 * Checks a downloaded badge SVG. It is served as a file from our own origin and shown with <img>,
 * so scripts in it would not run on the page, but someone could still open the file directly.
 * Anything active, external or unexpected is rejected.
 */
export function checkBadgeSvg(text) {
  const start = text.replace(/^\uFEFF?\s*(<\?xml[^>]*\?>\s*)?/, '');
  if (!start.startsWith('<svg')) return 'does not start with <svg';
  if (
    /<(script|style|foreignObject|iframe|object|embed|image|use|a|animate|set)\b|<!(DOCTYPE|ENTITY)|javascript:|data:|url\(\s*(?!["']?#)|@import/i.test(
      text,
    )
  ) {
    return 'contains an element or reference that is not allowed';
  }
  if (/\son[a-z]+\s*=/i.test(text)) return 'contains an event handler attribute';
  for (const [, value] of text.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)) {
    if (!value.startsWith('#')) return 'links to another resource';
  }
  return undefined;
}

async function fetchBadge(badge, outDir) {
  try {
    const { body, headers } = await download(badge.url, {
      maxBytes: BADGE_BYTES,
      timeoutMs: 20_000,
      accept: 'image/svg+xml',
    });
    const type = headers.get('content-type') ?? '';
    if (!/^image\/svg\+xml(;|$)/i.test(type)) throw new Error(`content type is ${type}`);
    const text = body.toString('utf8');
    const problem = checkBadgeSvg(text);
    if (problem) throw new Error(`the SVG ${problem}`);
    const label = /<svg\b[^>]*\saria-label="([^"]*)"/.exec(text)?.[1] ?? '';
    const value = badge.parse(label);
    if (!value) throw new Error(`unexpected badge text ${JSON.stringify(label)}`);
    await writeFile(join(outDir, badge.file), body);
    console.log(`docs export: badge ${badge.id}: ${label}`);
    return { file: badge.file, ...value };
  } catch (error) {
    // `::warning::` shows as an annotation in GitHub Actions and as a plain line elsewhere.
    console.warn(
      `::warning::Badge ${badge.id} (${badge.url}) not available: ${error.message}. ` +
        'The page shows a text link instead.',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Main

async function writeOut(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export async function main() {
  const release = await readRelease();
  const mapping = await readScreenshotMap();
  const zip = await getZip(release);

  const meta = await extractEntries(zip, ['docs-export.json', 'screenshots.json']);
  const docsExport = checkDocsExport(
    parseJson(meta.get('docs-export.json'), 'docs-export.json'),
    release.version,
  );
  const shots = resolveScreenshots(
    parseJson(meta.get('screenshots.json'), 'screenshots.json'),
    mapping,
  );
  const files = await extractEntries(
    zip,
    shots.flatMap((s) => [s.light, s.dark]),
  );

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(join(OUT_DIR, 'badges'), { recursive: true });
  await writeOut(join(OUT_DIR, 'docs-export.json'), `${JSON.stringify(docsExport, null, 2)}\n`);
  const written = [];
  for (const shot of shots) {
    const entry = { journey: shot.journey, slug: shot.slug };
    for (const variant of ['light', 'dark']) {
      const data = files.get(shot[variant]);
      checkPng(data, shot[variant]);
      entry[variant] = `screenshots/${shot.journey}/${shot.slug}.${variant}.png`;
      await writeOut(join(OUT_DIR, entry[variant]), data);
    }
    written.push(entry);
  }
  await writeOut(join(OUT_DIR, 'screenshots.json'), `${JSON.stringify(written, null, 2)}\n`);

  const badges = { date: new Date().toISOString().slice(0, 10) };
  for (const badge of BADGES) badges[badge.id] = await fetchBadge(badge, join(OUT_DIR, 'badges'));
  await writeOut(join(OUT_DIR, 'badges.json'), `${JSON.stringify(badges, null, 2)}\n`);

  console.log(
    `docs export: Scorpion ${release.tag}, ${written.length} screenshot pairs in src/assets/generated/`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`docs export: ${error.message}`);
    process.exitCode = 1;
  }
}
