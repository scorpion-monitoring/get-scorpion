// Tests of scripts/build-events.mjs and src/lib/events.ts (`pnpm test`). They call the exported
// functions with file contents, so they don't touch events/.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildFeed, parseEventYaml, validateEventFiles, validateFeed } from './build-events.mjs';
import { berlinMidnight, isFeedEvent, isPast, upcomingEvents } from '../src/lib/events.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'events');
const fixtures = readdirSync(FIXTURES).map((name) => ({
  name,
  text: readFileSync(join(FIXTURES, name), 'utf8'),
}));
const NOW = Date.parse('2026-11-20T12:00:00Z');

const valid = `id: demo
start: 2027-01-10
end: 2027-01-11
title:
  en: Demo
  de: Demo
summary:
  en: A demo.
  de: Eine Demo.
location: Online
url: https://example.org/demo
`;

/** Errors of `valid` after `change`, as file `name`. */
function errorsOf(change, name = 'demo.yaml') {
  return validateEventFiles([{ name, text: change(valid) }]).errors;
}

describe('validateEventFiles', () => {
  test('accepts a valid event and skips files starting with "_"', () => {
    const { events, errors } = validateEventFiles([
      { name: 'demo.yaml', text: valid },
      { name: '_template.yaml', text: 'not: valid' },
    ]);
    assert.deepEqual(errors, []);
    assert.equal(events.length, 1);
  });

  const cases = [
    [
      'a missing German title',
      (t) => t.replace('  de: Demo\n', ''),
      /demo\.yaml: title\.de: is required/,
    ],
    [
      'an http: URL',
      (t) => t.replace('https://', 'http://'),
      /demo\.yaml: url: must be an https:\/\/ URL/,
    ],
    [
      'end before start',
      (t) => t.replace('end: 2027-01-11', 'end: 2027-01-09'),
      /demo\.yaml: end: 2027-01-09 is before start/,
    ],
    ['an unknown field', (t) => `${t}speaker: Someone\n`, /demo\.yaml: speaker: unknown field/],
    ['invalid YAML', (t) => t.replace('title:', 'title: [unclosed'), /demo\.yaml: YAML: /],
    [
      'a duplicate key',
      (t) => `${t}location: Twice\n`,
      /demo\.yaml: YAML: Map keys must be unique/,
    ],
    [
      'a custom tag',
      (t) => t.replace('location: Online', 'location: !secret Online'),
      /demo\.yaml: YAML: /,
    ],
    [
      'a non-existent date',
      (t) => t.replace('2027-01-10', '2027-02-30'),
      /demo\.yaml: start: "2027-02-30" is not a real date/,
    ],
    [
      'mixed kinds',
      (t) => t.replace('end: 2027-01-11', 'end: 2027-01-11T10:00:00+01:00'),
      /end: must be the same kind/,
    ],
    [
      'a date-time without offset',
      (t) => t.replace('end: 2027-01-11', 'end: 2027-01-11T10:00:00'),
      /demo\.yaml: end: must be a date YYYY-MM-DD/,
    ],
    [
      'a title over 120 characters',
      (t) => t.replace('  en: Demo\n', `  en: ${'x'.repeat(121)}\n`),
      /title\.en: must NOT have more than 120 characters/,
    ],
    [
      'a blank location',
      (t) => t.replace('location: Online', 'location: "  "'),
      /location: must not be empty or blank/,
    ],
    [
      'a URL with credentials',
      (t) => t.replace('https://', 'https://user:pw@'),
      /url: must be an https:\/\/ URL/,
    ],
  ];
  for (const [label, change, expected] of cases) {
    test(`rejects ${label}`, () => {
      const errors = errorsOf(change);
      assert.ok(
        errors.some((e) => expected.test(e)),
        errors.join('\n'),
      );
    });
  }

  test('rejects an id that does not match the file name', () => {
    const errors = errorsOf((t) => t, 'other.yaml');
    assert.ok(
      errors.some((e) => /other\.yaml: id: "demo" must equal the file name "other"/.test(e)),
    );
  });

  test('rejects a duplicate id', () => {
    // Only reachable when the name check passes for one of them; simulate two files with one id.
    const { errors } = validateEventFiles([
      { name: 'demo.yaml', text: valid },
      { name: 'demo.yaml', text: valid },
    ]);
    assert.ok(errors.some((e) => /id: "demo" is already used by events\/demo\.yaml/.test(e)));
  });

  test('rejects other file types', () => {
    const { errors } = validateEventFiles([{ name: 'demo.yml', text: valid }]);
    assert.match(errors[0], /only \.yaml event files/);
  });

  test('isFeedEvent rejects everything the schema rejects', () => {
    for (const [label, change] of cases) {
      const parsed = parseEventYaml(change(valid));
      if (parsed.data !== undefined) assert.equal(isFeedEvent(parsed.data), false, label);
    }
    assert.equal(isFeedEvent(parseEventYaml(valid).data), true);
  });
});

describe('buildFeed', () => {
  test('drops past events and sorts the rest by start, then id', () => {
    const { events, errors } = validateEventFiles(fixtures);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      events.map((e) => e.id),
      ['autumn-meeting', 'spring-school', 'winter-workshop'],
    );
    const feed = buildFeed(events, NOW);
    assert.deepEqual(
      feed.events.map((e) => e.id),
      ['winter-workshop', 'spring-school'],
    );
    assert.equal(feed.schemaVersion, 1);
    assert.deepEqual(validateFeed(feed), []);
  });

  test('sorts by id when the start is the same', () => {
    const { events } = validateEventFiles([
      { name: 'b.yaml', text: valid.replace('id: demo', 'id: b') },
      { name: 'a.yaml', text: valid.replace('id: demo', 'id: a') },
    ]);
    assert.deepEqual(
      buildFeed(events, NOW).events.map((e) => e.id),
      ['a', 'b'],
    );
  });

  test('validateFeed rejects an unsorted feed and unknown fields', () => {
    const { events } = validateEventFiles(fixtures);
    const feed = buildFeed(events, NOW);
    assert.match(validateFeed({ ...feed, events: [...feed.events].reverse() })[0], /not sorted/);
    assert.match(validateFeed({ ...feed, generated: 'x' })[0], /generated: unknown field/);
    assert.match(validateFeed({ schemaVersion: 2, events: [] })[0], /schemaVersion/);
  });
});

describe('past events', () => {
  const event = (start, end) => ({ ...parseEventYaml(valid).data, start, end });

  test('a date ends at midnight in Europe/Berlin (CET)', () => {
    const e = event('2026-12-11', '2026-12-11');
    assert.equal(isPast(e, Date.parse('2026-12-11T22:59:59.999Z')), false);
    assert.equal(isPast(e, Date.parse('2026-12-11T23:00:00Z')), true);
  });

  test('a date ends at midnight in Europe/Berlin (CEST and the DST change)', () => {
    assert.equal(berlinMidnight(2027, 3, 28), Date.parse('2027-03-27T23:00:00Z'));
    assert.equal(berlinMidnight(2027, 3, 29), Date.parse('2027-03-28T22:00:00Z'));
    assert.equal(berlinMidnight(2027, 10, 31), Date.parse('2027-10-30T22:00:00Z'));
    assert.equal(berlinMidnight(2026, 12, 32), Date.parse('2026-12-31T23:00:00Z'));
  });

  test('a date-time ends at that instant', () => {
    const e = event('2027-01-10T09:00:00+01:00', '2027-01-10T17:00:00+01:00');
    assert.equal(isPast(e, Date.parse('2027-01-10T15:59:59Z')), false);
    assert.equal(isPast(e, Date.parse('2027-01-10T16:00:00Z')), true);
  });

  test('a running event is upcoming', () => {
    const e = event('2026-11-19', '2026-11-21');
    assert.deepEqual(upcomingEvents({ schemaVersion: 1, events: [e] }, NOW), [e]);
  });
});

describe('upcomingEvents (the client)', () => {
  const ok = parseEventYaml(valid).data;
  test('ignores anything that is not a feed', () => {
    for (const feed of [null, [], 'x', { events: [ok] }, { schemaVersion: 2, events: [ok] }]) {
      assert.deepEqual(upcomingEvents(feed, NOW), []);
    }
  });
  test('drops invalid entries and keeps valid ones', () => {
    const feed = {
      schemaVersion: 1,
      events: [
        ok,
        null,
        { ...ok, url: 'http://example.org/' },
        { ...ok, url: 'javascript:alert(1)' },
        { ...ok, title: { en: 'Only English' } },
        { ...ok, extra: true },
        { ...ok, id: 'Bad Id' },
      ],
    };
    assert.deepEqual(upcomingEvents(feed, NOW), [ok]);
  });
});
