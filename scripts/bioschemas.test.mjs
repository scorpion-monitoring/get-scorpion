// Unit tests of the structured data (docs/plan.md §7): the JSON-LD serialisation and the Bioschemas
// ComputationalTool markup, built from the real data files for each locale and checked offline
// against the vendored profile schema. `pnpm build` checks the built pages the same way
// (scripts/check-dist.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { parse } from 'yaml';
import { COMPUTATIONAL_TOOL_PROFILE, computationalTool } from '../src/lib/bioschemas.ts';
import { serializeJsonLd } from '../src/lib/jsonld.ts';
import { PROFILE_CHECK, loadComputationalTool } from './lib/structured-data.mjs';
import { checkNode } from './lib/bioschemas.mjs';

const ROOT = join(import.meta.dirname, '..');
const readYaml = (file) => parse(readFileSync(join(ROOT, 'src/data', file), 'utf8'));
const readJson = (file) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

const software = readYaml('software.yaml').scorpion;
const organisations = readYaml('funders.yaml');
const links = readYaml('links.yaml');
const profile = loadComputationalTool();

function build(locale) {
  const messages = readJson(`messages/${locale}.json`);
  return computationalTool(
    software,
    {
      organisations,
      links: Object.fromEntries(
        Object.entries(links).map(([id, link]) => [id, link.url ?? link.urls[locale]]),
      ),
      text: (key) => messages[key],
    },
    {
      id: 'https://scorpion.bi.denbi.de/#software',
      url: locale === 'en' ? 'https://scorpion.bi.denbi.de/' : 'https://scorpion.bi.denbi.de/de/',
      locale,
      version: '0.16.1',
    },
  );
}

describe('serializeJsonLd', () => {
  test('escapes every < so the data cannot end the script element', () => {
    const value = { name: '</script><script>alert(1)</script>', note: '<!-- x' };
    const text = serializeJsonLd(value);
    assert.ok(!text.includes('<'), text);
    assert.ok(text.includes('\\u003c/script>'));
    assert.deepEqual(JSON.parse(text), value);
  });

  test('rejects values that are not JSON', () => {
    assert.throws(() => serializeJsonLd(undefined));
  });
});

describe('ComputationalTool markup from src/data/', () => {
  for (const locale of ['en', 'de']) {
    test(`${locale}: passes the ComputationalTool 1.0-RELEASE check`, () => {
      const node = build(locale);
      assert.deepEqual(checkNode(node, profile, PROFILE_CHECK), []);
      assert.equal(node['dct:conformsTo']['@id'], COMPUTATIONAL_TOOL_PROFILE);
      assert.equal(node.inLanguage, locale);
      assert.equal(node.softwareVersion, '0.16.1');
      assert.equal(node.description, readJson(`messages/${locale}.json`)[software.description]);
    });
  }

  test('organisations come from funders.yaml, with their ROR id', () => {
    const node = build('en');
    assert.deepEqual(
      node.provider.map((o) => o['@id']),
      software.providers.map((id) => organisations[id].ror),
    );
    assert.ok(
      node.author.some((a) => a['@type'] === 'Person' && a['@id'].startsWith('https://orcid.org/')),
    );
  });

  test('an unknown organisation id fails', () => {
    const sources = {
      organisations,
      links: { github: 'https://x.test/', docs: 'https://x.test/' },
      text: String,
    };
    assert.throws(
      () => computationalTool({ ...software, providers: ['nobody'] }, sources, {}),
      /unknown organisation "nobody"/,
    );
  });
});

describe('checkNode finds problems', () => {
  const good = build('en');
  const problems = (changes) => checkNode({ ...good, ...changes }, profile, PROFILE_CHECK);
  const without = (key) => Object.fromEntries(Object.entries(good).filter(([k]) => k !== key));

  test('a missing Minimum property', () => {
    assert.match(
      checkNode(without('name'), profile, PROFILE_CHECK).join('\n'),
      /Minimum property name/,
    );
  });
  test('a missing Recommended property we promise', () => {
    assert.match(
      checkNode(without('citation'), profile, PROFILE_CHECK).join('\n'),
      /Recommended property citation/,
    );
  });
  test('another profile version', () => {
    assert.match(
      problems({
        'dct:conformsTo': {
          '@id': `${COMPUTATIONAL_TOOL_PROFILE.replace('1.0-RELEASE', '1.1-DRAFT')}`,
        },
      }).join('\n'),
      /dct:conformsTo/,
    );
  });
  test('a context without the dct prefix', () => {
    assert.match(problems({ '@context': 'https://schema.org/' }).join('\n'), /@context/);
  });
  test('a misspelled property', () => {
    assert.match(problems({ licence: 'x' }).join('\n'), /unknown property licence/);
  });
  test('an EDAM topic where an operation belongs', () => {
    assert.match(
      problems({ featureList: [{ '@id': 'http://edamontology.org/topic_0605' }] }).join('\n'),
      /featureList.*not an EDAM operation/,
    );
  });
  test('a type the schema rejects', () => {
    assert.match(
      problems({ isAccessibleForFree: 'yes' }).join('\n'),
      /schema: \/isAccessibleForFree/,
    );
  });
});
