// Reads the content collections from src/content.config.ts. The `file()` loader only logs an error,
// and leaves the collection empty, when a YAML file is missing or can't be parsed, so these helpers
// fail the build in that case.
import { getCollection, getEntry } from 'astro:content';

export async function getLink(id: string) {
  const entry = await getEntry('links', id);
  if (!entry) throw new Error(`src/data/links.yaml has no entry "${id}"`);
  return entry.data;
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
