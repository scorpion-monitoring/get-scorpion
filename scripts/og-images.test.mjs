// The Open Graph images and favicons in public/ are committed outputs of `pnpm og-images`
// (docs/plan.md §7). These tests fail when they are stale (an input changed since they were made)
// or were changed by hand, so a text change can't ship with an old image. Needs no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { LOCALES, OUTPUTS, inputHash, readManifest } from './og-images.mjs';

const ROOT = join(import.meta.dirname, '..');
const HINT = 'run `pnpm og-images` and commit public/ and scripts/og-images.json';

test('the images were made from the current inputs', async () => {
  const manifest = await readManifest();
  assert.equal(manifest.inputs, await inputHash(), `The images are stale; ${HINT}`);
});

test('the committed images are the ones the script wrote', async () => {
  const manifest = await readManifest();
  assert.deepEqual(Object.keys(manifest.outputs).sort(), [...OUTPUTS].sort());
  for (const path of OUTPUTS) {
    const hash = createHash('sha256')
      .update(await readFile(join(ROOT, path)))
      .digest('hex');
    assert.equal(hash, manifest.outputs[path], `${path} was changed by hand; ${HINT}`);
  }
});

test('the Open Graph images are 1200×630 PNGs', async () => {
  for (const locale of LOCALES) {
    const png = await readFile(join(ROOT, `public/og/${locale}.png`));
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  }
});
