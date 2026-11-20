// Tests of scripts/build-events.mjs and src/lib/events.ts (`pnpm test`). They call the exported
// functions with file contents, so they don't touch events/.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  buildFeed,
  buildJsonLd,
  parseEventYaml,
  validateEventFiles,
  validateFeed,
  validateJsonLdText,
} from './build-events.mjs';
import { berlinMidnight, isFeedEvent, isPast, upcomingEvents } from '../src/lib/events.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'events');
const fixtures = readdirSync(FIXTURES).map((name) => ({
  name,
  text: readFileSync(join(FIXTURES, name), 'utf8'),
}));
const NOW = Date.parse('2026-11-20T12:00:00Z');

const valid = `id: demo
type: workshop
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
host:
  name: Example host
contact:
  name: Example office
  email: office@example.org
`;

/** `valid` as a training: needs mode and keywords. */
const training = valid
  .replace('type: workshop', 'type: training')
  .concat('mode: online\nkeywords:\n  - Scorpion\n');

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
    ['a missing type', (t) => t.replace('type: workshop\n', ''), /demo\.yaml: type: is required/],
    [
      'an unknown type',
      (t) => t.replace('type: workshop', 'type: party'),
      /demo\.yaml: type: must be one of training, hackathon, workshop, meeting, conference/,
    ],
    [
      'a missing host',
      (t) => t.replace('host:\n  name: Example host\n', ''),
      /demo\.yaml: host: is required/,
    ],
    [
      'a missing contact',
      (t) => t.replace(/contact:\n.*\n.*\n$/, ''),
      /demo\.yaml: contact: is required/,
    ],
    [
      'a contact without email or url',
      (t) => t.replace('  email: office@example.org\n', ''),
      /demo\.yaml: contact: needs an email or a url/,
    ],
    [
      'a contact email that is not one',
      (t) => t.replace('office@example.org', 'office at example.org'),
      /contact\.email: must be an email address/,
    ],
    [
      'an http: registration URL',
      (t) => `${t}registration: http://example.org/register\n`,
      /demo\.yaml: registration: must be an https:\/\/ URL/,
    ],
    [
      'an http: host URL',
      (t) =>
        t.replace('  name: Example host\n', '  name: Example host\n  url: http://example.org/\n'),
      /host\.url: must be an https:\/\/ URL/,
    ],
    [
      'a ROR id that is not one',
      (t) => t.replace('  name: Example host\n', '  name: Example host\n  ror: 01vmpm840\n'),
      /host\.ror: must be a ROR id/,
    ],
    [
      'a mode for a type other than training',
      (t) => `${t}mode: online\n`,
      /demo\.yaml: \(file\): mode is only allowed for type training/,
    ],
    [
      'an address without country',
      (t) => `${t}address:\n  locality: Göttingen\n`,
      /address\.country: is required/,
    ],
    [
      'a country that is not an ISO code',
      (t) => `${t}address:\n  locality: Göttingen\n  country: Germany\n`,
      /address\.country: must be an ISO 3166-1 alpha-2 code/,
    ],
    [
      'a keyword with a comma',
      (t) => `${t}keywords:\n  - a, b\n`,
      /keywords\.0: must not contain a comma/,
    ],
    [
      'too many keywords',
      (t) => `${t}keywords:\n${[...'abcdefghijk'].map((k) => `  - ${k}\n`).join('')}`,
      /keywords: must NOT have more than 10 items/,
    ],
    ['a capacity of 0', (t) => `${t}capacity: 0\n`, /capacity: must be >= 1/],
    ['a language in capitals', (t) => `${t}language: EN\n`, /language: must be an ISO 639-1 code/],
    ['tess as text', (t) => `${t}tess: "no"\n`, /tess: must be boolean/],
  ];

  const trainingCases = [
    [
      'a training without mode',
      (t) => t.replace('mode: online\n', ''),
      /demo\.yaml: mode: is required/,
    ],
    [
      'a training without keywords',
      (t) => t.replace('keywords:\n  - Scorpion\n', ''),
      /demo\.yaml: keywords: is required/,
    ],
    [
      'an unknown mode',
      (t) => t.replace('mode: online', 'mode: hybrid'),
      /mode: must be one of online, onsite, blended/,
    ],
    [
      'keywords that differ only in case',
      (t) => `${t}  - scorpion\n`,
      /keywords: must be unique, ignoring case/,
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
  for (const [label, change, expected] of trainingCases) {
    test(`rejects ${label}`, () => {
      const errors = errorsOf((t) => change(training.replace(valid, t)));
      assert.ok(
        errors.some((e) => expected.test(e)),
        errors.join('\n'),
      );
    });
  }

  test('accepts every type, a training with mode and keywords, and an event without url', () => {
    for (const type of ['hackathon', 'workshop', 'meeting', 'conference']) {
      assert.deepEqual(
        errorsOf((t) => t.replace('type: workshop', `type: ${type}`)),
        [],
        type,
      );
    }
    assert.deepEqual(
      errorsOf(() => training),
      [],
    );
    assert.deepEqual(
      errorsOf((t) => t.replace('url: https://example.org/demo\n', '')),
      [],
    );
  });

  test('the template is a valid event', () => {
    const text = readFileSync(join(import.meta.dirname, '../events/_template.yaml'), 'utf8');
    const { events, errors } = validateEventFiles([{ name: 'denbi-plenary-2027.yaml', text }]);
    assert.deepEqual(errors, []);
    assert.equal(events.length, 1);
  });

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
    for (const [label, change] of trainingCases) {
      const parsed = parseEventYaml(change(training));
      if (parsed.data !== undefined) assert.equal(isFeedEvent(parsed.data), false, label);
    }
    assert.equal(isFeedEvent(parseEventYaml(valid).data), true);
    assert.equal(isFeedEvent(parseEventYaml(training).data), true);
  });
});

describe('buildFeed', () => {
  test('drops past events and sorts the rest by start, then id', () => {
    const { events, errors } = validateEventFiles(fixtures);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      events.map((e) => e.id),
      [
        'autumn-meeting',
        'hack-days',
        'partner-call',
        'spring-school',
        'summit',
        'user-meeting',
        'winter-workshop',
      ],
    );
    const feed = buildFeed(events, NOW);
    assert.deepEqual(
      feed.events.map((e) => e.id),
      ['winter-workshop', 'hack-days', 'user-meeting', 'partner-call', 'spring-school', 'summit'],
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
        { ...ok, type: 'party' },
        { ...ok, registration: 'http://example.org/' },
        { ...ok, contact: { name: 'Nobody' } },
        { ...ok, host: { name: 'Host', url: 'javascript:alert(1)' } },
        { ...ok, mode: 'online' },
      ],
    };
    assert.deepEqual(upcomingEvents(feed, NOW), [ok]);
  });
});

describe('events.jsonld', () => {
  const { events } = validateEventFiles(fixtures);
  const feed = buildFeed(events, NOW);
  const text = buildJsonLd(feed);
  const doc = JSON.parse(text);
  const byId = Object.fromEntries(
    doc['@graph'].map((node) => [node['@id'].replace(/^.*#(?:event|course)-/, ''), node]),
  );

  test('starts with "{" and passes the profile checks', () => {
    assert.ok(text.startsWith('{'));
    assert.deepEqual(validateJsonLdText(text), []);
  });

  test('holds the upcoming events that are not opted out of TeSS, in feed order', () => {
    assert.deepEqual(Object.keys(byId), [
      'winter-workshop',
      'hack-days',
      'user-meeting',
      'spring-school',
      'summit',
    ]);
  });

  test('maps each type to its profile', () => {
    const types = (id) => [byId[id]['@type'], byId[id].eventType?.name, byId[id].keywords];
    assert.deepEqual(types('winter-workshop'), ['Event', 'workshops and courses', undefined]);
    assert.deepEqual(types('hack-days'), [
      'Event',
      'workshops and courses',
      'service management, hackathon',
    ]);
    assert.deepEqual(types('user-meeting'), ['Event', 'meetings and conferences', undefined]);
    assert.deepEqual(types('summit'), ['Event', 'meetings and conferences', undefined]);
    const course = byId['spring-school'];
    assert.equal(course['@type'], 'Course');
    assert.equal(
      course['dct:conformsTo']['@id'],
      'https://bioschemas.org/profiles/Course/1.0-RELEASE',
    );
    assert.equal(course.keywords, 'KPI monitoring, Scorpion');
    const instance = course.hasCourseInstance;
    assert.equal(instance['@type'], 'CourseInstance');
    assert.equal(instance['@id'], 'https://scorpion.bi.denbi.de/#event-spring-school');
    assert.equal(instance.courseMode, 'blended');
    assert.equal(instance.startDate, '2027-03-10T09:00:00+01:00');
    assert.deepEqual(instance.offers, {
      '@type': 'Offer',
      url: 'https://example.org/spring/register',
    });
    assert.equal(instance.location.address.postalCode, '06466');
    assert.equal(byId['user-meeting'].inLanguage, 'de');
  });

  test('an event without url gets its card on the landing page as url and @id', () => {
    const node = byId['winter-workshop'];
    assert.equal(node.url, 'https://scorpion.bi.denbi.de/#event-winter-workshop');
    assert.equal(node['@id'], node.url);
    assert.equal(node.location, 'Online');
  });

  test('the check finds problems', () => {
    const changed = (change) => {
      const copy = structuredClone(doc);
      change(copy['@graph']);
      return validateJsonLdText(JSON.stringify(copy)).join('\n');
    };
    assert.match(validateJsonLdText(`  ${text}`)[0], /must start with/);
    assert.match(validateJsonLdText('{')[0], /\(document\)/);
    assert.match(
      changed((g) => delete g[0].hostInstitution),
      /Minimum property hostInstitution/,
    );
    assert.match(
      changed((g) => delete g[3].hasCourseInstance.courseMode),
      /courseMode/,
    );
    assert.match(
      changed((g) => (g[1].url = g[0].url)),
      /duplicate .*TeSS would merge/,
    );
    assert.match(
      changed((g) => (g[0].eventType.name = 'party')),
      /vocabulary/,
    );
    assert.match(
      changed((g) => (g[0]['@type'] = 'Thing')),
      /not Event or Course/,
    );
    assert.match(
      changed((g) => (g[2].startDate = 'soon')),
      /schema: \/startDate/,
    );
  });

  test('escapes every < in the text', () => {
    const xss = '</script><img src=x onerror=alert(1)>';
    const event = { ...feed.events[0], title: { en: xss, de: xss } };
    const out = buildJsonLd({ schemaVersion: 1, events: [event] });
    assert.ok(!out.includes('<'));
    assert.equal(JSON.parse(out)['@graph'][0].name, xss);
  });

  test('an empty feed gives an empty graph', () => {
    const empty = JSON.parse(buildJsonLd({ schemaVersion: 1, events: [] }));
    assert.deepEqual(empty['@graph'], []);
    assert.deepEqual(
      JSON.parse(readFileSync(join(import.meta.dirname, '../public/events/events.jsonld'), 'utf8')),
      empty,
    );
  });
});
