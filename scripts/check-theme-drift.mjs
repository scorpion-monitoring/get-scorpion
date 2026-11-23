// `pnpm check:theme-drift [--ref <tag|branch|sha>] [--report <file>]`: compares the daisyUI theme
// blocks in src/styles/app.css with the ones in the application repo (docs/plan.md §6), by default
// at its latest release. upstream.yml runs it weekly and opens or updates an issue on drift.
//
// Compared: the `@plugin 'daisyui'` block (the theme list) and every `@plugin 'daisyui/theme'`
// block, as declarations per block (comments and whitespace ignored), so the report names each
// token that changed. Why the latest release and not `dev`: the page pins a release for the docs
// export and its screenshots (§3), so its themes should match a release too, and `dev` would
// report changes that may still be reverted before they ship.
//
// Exit code 0: no drift; 1: drift (the report lists it); 2: the check itself failed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO, download, githubApi } from './fetch-docs-export.mjs';

const LOCAL = join(import.meta.dirname, '..', 'src', 'styles', 'app.css');
const UPSTREAM_PATH = 'apps/web/src/app.css';

/**
 * Parses the daisyUI blocks of a stylesheet into a Map from block key (`daisyui`, or
 * `theme <name>`) to a Map of property to value.
 */
export function parseThemeBlocks(css) {
  const blocks = new Map();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, , plugin, body] of text.matchAll(/@plugin\s+(['"])([^'"]+)\1\s*\{([^}]*)\}/g)) {
    if (plugin !== 'daisyui' && plugin !== 'daisyui/theme') continue;
    const declarations = new Map();
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) continue;
      const property = declaration.slice(0, colon).trim();
      const value = declaration
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^'(.*)'$/, '"$1"');
      if (property) declarations.set(property, value);
    }
    const name = declarations.get('name')?.replace(/"/g, '');
    const key = plugin === 'daisyui' ? 'daisyui' : `theme ${name ?? '(unnamed)'}`;
    if (blocks.has(key)) throw new Error(`two blocks "${key}"`);
    blocks.set(key, declarations);
  }
  return blocks;
}

/** Lists the differences as rows `{ block, property, here, upstream }` (absent: undefined). */
export function compareThemes(here, upstream) {
  const rows = [];
  for (const block of new Set([...here.keys(), ...upstream.keys()])) {
    const a = here.get(block) ?? new Map();
    const b = upstream.get(block) ?? new Map();
    if (!here.has(block) || !upstream.has(block)) {
      rows.push({
        block,
        property: '(block)',
        here: here.has(block) ? 'present' : undefined,
        upstream: upstream.has(block) ? 'present' : undefined,
      });
      continue;
    }
    for (const property of new Set([...a.keys(), ...b.keys()])) {
      if (a.get(property) !== b.get(property)) {
        rows.push({ block, property, here: a.get(property), upstream: b.get(property) });
      }
    }
  }
  return rows;
}

async function latestRelease() {
  const { tag_name: tag } = await githubApi(`/repos/${REPO}/releases/latest`);
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`unexpected latest release tag ${JSON.stringify(tag)}`);
  }
  return tag;
}

export function driftReport(rows, ref) {
  const cell = (value) => (value === undefined ? '_(absent)_' : `\`${value.replace(/`/g, "'")}\``);
  const source = `https://github.com/${REPO}/blob/${ref}/${UPSTREAM_PATH}`;
  return [
    `The daisyUI theme blocks in \`src/styles/app.css\` differ from [\`${UPSTREAM_PATH}\` at ${ref}](${source}) in the application repo (docs/plan.md §6).`,
    '',
    '| Block | Property | Here | Upstream |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (row) => `| ${row.block} | \`${row.property}\` | ${cell(row.here)} | ${cell(row.upstream)} |`,
    ),
    '',
    'To resolve it: copy the theme list and the two theme blocks from upstream verbatim, update the',
    'commit in the header comment of `src/styles/app.css`, and run `pnpm build` and',
    '`pnpm check:browser` (contrast in both themes). See CONTRIBUTING.md, "Theme drift".',
    '',
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: { ref: { type: 'string' }, report: { type: 'string' } },
    strict: true,
  });
  const ref = values.ref ?? (await latestRelease());
  if (!/^[\w.\-/]+$/.test(ref)) throw new Error(`--ref: unexpected characters in "${ref}"`);
  const { body } = await download(
    `https://raw.githubusercontent.com/${REPO}/${ref}/${UPSTREAM_PATH}`,
    { maxBytes: 1024 * 1024 },
  );
  const upstream = parseThemeBlocks(body.toString('utf8'));
  const here = parseThemeBlocks(readFileSync(LOCAL, 'utf8'));
  if (!upstream.has('daisyui') || upstream.size < 2) {
    throw new Error(`${UPSTREAM_PATH} at ${ref} has no daisyUI theme blocks; moved upstream?`);
  }

  const rows = compareThemes(here, upstream);
  if (rows.length === 0) {
    console.log(`check-theme-drift: the themes match ${REPO} ${UPSTREAM_PATH} at ${ref}`);
    return 0;
  }
  const text = driftReport(rows, ref);
  if (values.report) writeFileSync(values.report, text);
  console.error(`check-theme-drift: ${rows.length} difference(s) from ${ref}\n\n${text}`);
  return 1;
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`check-theme-drift: ${error instanceof Error ? error.message : error}`);
      process.exit(2);
    },
  );
}
