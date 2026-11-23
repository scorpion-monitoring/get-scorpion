// Tests of scripts/fetch-events.mjs (`pnpm test`): a local server stands in for the events release.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { checkFeed, checkJsonLd, updateAll } from './fetch-events.mjs';

const EVENT = {
  id: 'demo',
  type: 'workshop',
  start: '2027-01-10',
  end: '2027-01-11',
  title: { en: 'Demo', de: 'Demo' },
  summary: { en: 'A demo.', de: 'Eine Demo.' },
  location: 'Online',
  host: { name: 'Example host' },
  contact: { name: 'Example office', email: 'office@example.org' },
};
const FEED = JSON.stringify({ schemaVersion: 1, events: [EVENT] });
const JSONLD = JSON.stringify({ '@context': 'https://schema.org/', '@graph': [] });
const quiet = { info() {}, warn() {} };

describe('checkFeed', () => {
  test('accepts a valid feed and an empty one', () => {
    assert.equal(checkFeed(FEED), undefined);
    assert.equal(checkFeed('{ "schemaVersion": 1, "events": [] }'), undefined);
  });
  test('rejects anything else', () => {
    assert.match(checkFeed('<html>'), /not JSON/);
    assert.match(checkFeed('[]'), /not an object/);
    assert.match(checkFeed('{"schemaVersion":2,"events":[]}'), /schemaVersion 2/);
    assert.match(checkFeed('{"schemaVersion":1,"events":[],"x":1}'), /unexpected fields/);
    const bad = { ...EVENT, url: 'http://example.org/' };
    assert.match(checkFeed(JSON.stringify({ schemaVersion: 1, events: [bad] })), /event 0/);
  });
});

describe('checkJsonLd', () => {
  test('accepts a document with @context and @graph', () => {
    assert.equal(checkJsonLd(JSONLD), undefined);
  });
  test('rejects anything else', () => {
    assert.match(checkJsonLd(' {}'), /does not start/);
    assert.match(checkJsonLd('{"@graph":[]}'), /unexpected fields/);
    assert.match(checkJsonLd('{"@context":"x","@graph":{}}'), /not a list/);
    assert.match(checkJsonLd('{nope'), /not JSON/);
  });
});

describe('updateAll', () => {
  const files = new Map();
  let server;
  let base;
  let dir;

  before(async () => {
    server = createServer((request, response) => {
      const body = files.get(request.url.slice(1));
      if (body === undefined) {
        response.writeHead(404).end('Not Found');
        return;
      }
      response.writeHead(200).end(body);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
  });
  after(() => server.close());
  beforeEach(() => {
    if (dir) rmSync(dir, { recursive: true });
    dir = mkdtempSync(join(tmpdir(), 'fetch-events-'));
    files.clear();
  });

  const read = (name) => readFileSync(join(dir, name), 'utf8');

  test('installs valid files, then reports them unchanged', async () => {
    files.set('events.json', FEED).set('events.jsonld', JSONLD);
    assert.deepEqual(await updateAll(dir, base, quiet), ['updated', 'updated']);
    assert.equal(read('events.json'), FEED);
    assert.equal(read('events.jsonld'), JSONLD);
    assert.deepEqual(await updateAll(dir, base, quiet), ['unchanged', 'unchanged']);
  });

  test('keeps the last good file on a 404 or an invalid file, each file on its own', async () => {
    writeFileSync(join(dir, 'events.json'), FEED);
    writeFileSync(join(dir, 'events.jsonld'), JSONLD);
    const newer = JSON.stringify({ '@context': 'https://schema.org/', '@graph': [{}] });
    files.set('events.jsonld', newer);
    assert.deepEqual(await updateAll(dir, base, quiet), ['kept', 'updated']);
    assert.equal(read('events.json'), FEED);
    assert.equal(read('events.jsonld'), newer);
    files.set('events.json', '{"schemaVersion":1}').set('events.jsonld', 'oops');
    assert.deepEqual(await updateAll(dir, base, quiet), ['kept', 'kept']);
    assert.equal(read('events.json'), FEED);
    assert.equal(read('events.jsonld'), newer);
  });

  test('a network error keeps the files too', async () => {
    writeFileSync(join(dir, 'events.json'), FEED);
    assert.deepEqual(await updateAll(dir, 'http://127.0.0.1:9/', quiet), ['kept', 'kept']);
    assert.equal(read('events.json'), FEED);
  });
});
