// What events.jsonld must satisfy (docs/plan.md §4), shared by scripts/build-events.mjs
// (`--check-jsonld`, and every build) and its tests. Each node is checked offline against its
// Bioschemas profile with checkNode() from M6 (scripts/lib/bioschemas.mjs), and the document as a
// whole against the rules TeSS relies on: it is one JSON object, every node has a unique `@id` and a
// unique https `url` (TeSS deduplicates by `url`).
import { join } from 'node:path';
import {
  COURSE_INSTANCE_PROFILE,
  COURSE_PROFILE,
  EVENT_PROFILE,
} from '../../src/lib/event-jsonld.ts';
import { JSONLD_CONTEXT } from '../../src/lib/jsonld.ts';
import { checkNode, loadProfile } from './bioschemas.mjs';

const DIR = join(import.meta.dirname, '../bioschemas');

const event = loadProfile(join(DIR, 'Event_v0.3-DRAFT.json'), EVENT_PROFILE);
const course = loadProfile(join(DIR, 'Course_v1.0-RELEASE.json'), COURSE_PROFILE);
const courseInstance = loadProfile(
  join(DIR, 'CourseInstance_v1.0-RELEASE.json'),
  COURSE_INSTANCE_PROFILE,
);

/**
 * Options for checkNode() per profile. `recommended`: the Recommended properties we always fill.
 * `extra`: schema.org properties we add beyond the profile because TeSS reads them
 * (tess_rdf_extractors): `organizer` and `inLanguage` on an Event, `hostInstitution` and `contact`
 * on a CourseInstance (the Event profile's Minimum properties, which a CourseInstance as an Event
 * may carry too).
 */
export const EVENT_CHECKS = {
  Event: { profile: event, recommended: ['url'], extra: ['organizer', 'inLanguage'] },
  Course: { profile: course, recommended: ['hasCourseInstance', 'provider', 'url'], extra: [] },
  CourseInstance: {
    profile: courseInstance,
    recommended: ['endDate', 'inLanguage', 'startDate', 'url'],
    extra: ['hostInstitution', 'contact'],
  },
};

const EVENT_TYPES = new Set([
  'workshops and courses',
  'meetings and conferences',
  'receptions and networking',
  'awards and prizegivings',
]);

/** @param {string} type @param {Record<string, unknown>} node */
function checkTyped(type, node) {
  const check = EVENT_CHECKS[/** @type {keyof typeof EVENT_CHECKS} */ (type)];
  if (!check) return [`@type ${JSON.stringify(type)} is not Event or Course`];
  return checkNode({ '@context': JSONLD_CONTEXT, ...node }, check.profile, check);
}

/**
 * Checks a parsed events.jsonld document. Returns problems as `@graph.<i>: message` lines.
 * @param {unknown} doc
 */
export function checkEventsJsonLd(doc) {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['(document): must be a JSON object'];
  }
  const record = /** @type {Record<string, unknown>} */ (doc);
  const problems = [];
  const keys = Object.keys(record).sort().join(',');
  if (keys !== '@context,@graph') problems.push('(document): keys must be @context and @graph');
  if (JSON.stringify(record['@context']) !== JSON.stringify(JSONLD_CONTEXT)) {
    problems.push('@context: must be the schema.org vocabulary with the dct prefix');
  }
  const graph = record['@graph'];
  if (!Array.isArray(graph)) return [...problems, '@graph: must be an array'];

  const ids = new Set();
  const urls = new Set();
  graph.forEach((node, index) => {
    const at = `@graph.${index}`;
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      problems.push(`${at}: not an object`);
      return;
    }
    const nodes = [node];
    problems.push(...checkTyped(node['@type'], node).map((p) => `${at}: ${p}`));
    if (node['@type'] === 'Course') {
      const instance = node.hasCourseInstance;
      if (typeof instance !== 'object' || instance === null || Array.isArray(instance)) {
        problems.push(`${at}.hasCourseInstance: must be one CourseInstance`);
      } else {
        nodes.push(instance);
        if (instance['@type'] !== 'CourseInstance') {
          problems.push(`${at}.hasCourseInstance: @type must be CourseInstance`);
        } else {
          problems.push(
            ...checkTyped('CourseInstance', instance).map((p) => `${at}.hasCourseInstance: ${p}`),
          );
        }
        if (instance.url !== node.url) {
          problems.push(`${at}: the Course and its CourseInstance must have the same url`);
        }
      }
    }
    if (node['@type'] === 'Event' && !EVENT_TYPES.has(node.eventType?.name)) {
      problems.push(`${at}.eventType: not a term of the Event profile's vocabulary`);
    }
    for (const n of nodes) {
      if (ids.has(n['@id'])) problems.push(`${at}: duplicate @id ${n['@id']}`);
      ids.add(n['@id']);
    }
    const url = node.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      problems.push(`${at}.url: must be an https URL`);
    } else if (urls.has(url)) {
      problems.push(`${at}.url: duplicate ${url}; TeSS would merge the two`);
    }
    urls.add(url);
  });
  return problems;
}
