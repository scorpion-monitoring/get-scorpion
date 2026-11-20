// Reads the content collections from src/content.config.ts. The `file()` loader only logs an error,
// and leaves the collection empty, when a YAML file is missing or can't be parsed, so these helpers
// fail the build in that case.
import { getCollection, getEntry } from 'astro:content';
import type { Locale } from '../paraglide/runtime.js';

/** A link from links.yaml with the URL for the given page locale. */
export async function getLink(id: string, locale: Locale) {
  const entry = await getEntry('links', id);
  if (!entry) throw new Error(`src/data/links.yaml has no entry "${id}"`);
  const { url, urls, label } = entry.data;
  // The schema allows exactly one of the two, and `urls` has every locale.
  const resolved = urls ? urls[locale] : url;
  if (!resolved) throw new Error(`src/data/links.yaml: "${id}" has no URL for ${locale}`);
  return { url: resolved, label };
}

export async function getInstances() {
  const entries = await getCollection('instances');
  if (entries.length === 0) throw new Error('src/data/instances.yaml has no entries');
  return entries.map((e) => e.data).sort((a, b) => a.order - b.order);
}

export async function getFunders() {
  const entries = await getCollection('funders');
  if (entries.length === 0) throw new Error('src/data/funders.yaml has no entries');
  return entries.map((e) => e.data).sort((a, b) => a.order - b.order);
}

/** The Bioschemas data of Scorpion (software.yaml). */
export async function getSoftware() {
  const entry = await getEntry('software', 'scorpion');
  if (!entry) throw new Error('src/data/software.yaml has no entry "scorpion"');
  return entry.data;
}
