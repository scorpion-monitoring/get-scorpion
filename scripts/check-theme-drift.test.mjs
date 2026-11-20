// Tests of the parser and the comparison in scripts/check-theme-drift.mjs (docs/plan.md §6), on
// src/styles/app.css itself. Needs no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareThemes, driftReport, parseThemeBlocks } from './check-theme-drift.mjs';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'styles', 'app.css'), 'utf8');

test('app.css has the theme list and both Scorpion themes', () => {
  const blocks = parseThemeBlocks(css);
  assert.deepEqual([...blocks.keys()], ['daisyui', 'theme scorpionlight', 'theme scorpiondark']);
  assert.equal(
    blocks.get('daisyui').get('themes'),
    'scorpionlight --default, scorpiondark --prefersdark',
  );
  assert.equal(blocks.get('theme scorpionlight').get('--color-primary'), '#006da8');
});

test('comments, whitespace and quote style are not drift', () => {
  const reformatted = css
    .replace(/\/\*[\s\S]*?\*\//g, '/* another comment */')
    .replace(/: /g, ':   ')
    .replace(/'scorpionlight'/, '"scorpionlight"');
  assert.deepEqual(compareThemes(parseThemeBlocks(css), parseThemeBlocks(reformatted)), []);
});

test('a changed, added or removed token and a removed theme are drift', () => {
  const upstream = css
    .replace('--color-primary: #006da8;', '--color-primary: #0082c8;')
    .replace('--noise: 0;', '--noise: 0;\n  --color-extra: red;')
    .replace(/@plugin 'daisyui\/theme' \{\s*name: 'scorpiondark';[^}]*\}/, '');
  const rows = compareThemes(parseThemeBlocks(css), parseThemeBlocks(upstream));
  assert.deepEqual(rows, [
    {
      block: 'theme scorpionlight',
      property: '--color-primary',
      here: '#006da8',
      upstream: '#0082c8',
    },
    { block: 'theme scorpionlight', property: '--color-extra', here: undefined, upstream: 'red' },
    { block: 'theme scorpiondark', property: '(block)', here: 'present', upstream: undefined },
  ]);
  const text = driftReport(rows, 'v9.9.9');
  assert.match(text, /\| theme scorpionlight \| `--color-primary` \| `#006da8` \| `#0082c8` \|/);
  assert.match(text, /_\(absent\)_/);
});
