// Offline check of a JSON-LD node against a Bioschemas profile (docs/plan.md §7). Reusable: M6b
// checks the event markup with it. Needs no network: the profile's JSON schema is vendored in
// scripts/bioschemas/ (source and licence in its README).
//
// What is checked:
// - the profile's JSON schema (`$validation`, JSON Schema draft-07) with Ajv;
// - the Minimum properties the schema leaves out: `@context` (schema.org vocabulary and the `dct`
//   prefix), `@type` (the schema.org class the profile extends), an absolute `@id`, and
//   `dct:conformsTo` naming the versioned profile URL;
// - the schema's `required` (Minimum) properties, plus the Recommended ones we promise to fill;
// - no property the profile doesn't know, except those named in `extra` (catches typos);
// - EDAM terms: properties that expect an EDAM topic or operation hold edamontology.org IRIs of
//   that kind.
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';

const SCHEMA_ORG = 'https://schema.org/';
const DCT = 'http://purl.org/dc/terms/';

/**
 * Loads a vendored profile schema.
 * @param {string} file path to the profile's JSON-LD file, for example
 *   scripts/bioschemas/ComputationalTool_v1.0-RELEASE.json
 * @param {string} url the versioned profile URL, for example
 *   https://bioschemas.org/profiles/ComputationalTool/1.0-RELEASE
 */
export function loadProfile(file, url) {
  const document = JSON.parse(readFileSync(file, 'utf8'));
  const graph = document['@graph']?.[0];
  const validation = graph?.$validation;
  const superClass = graph?.['rdfs:subClassOf']?.['@id'];
  if (!validation || typeof superClass !== 'string' || !superClass.startsWith('schema:')) {
    throw new Error(`${file} is not a Bioschemas profile schema`);
  }
  const ajv = new Ajv({ strict: false, allErrors: true });
  // The schemas use `format: uri`; Ajv needs the format defined (no ajv-formats dependency).
  ajv.addFormat('uri', (value) => URL.canParse(value));
  const { required = [], recommended = [], optional = [] } = validation;
  /** @type {Record<string, 'topic' | 'operation'>} */
  const edam = {};
  for (const [name, schema] of Object.entries(validation.properties ?? {})) {
    const text = JSON.stringify(schema);
    if (text.includes('#/definitions/edamTopic')) edam[name] = 'topic';
    if (text.includes('#/definitions/edamOperation')) edam[name] = 'operation';
  }
  return {
    url,
    type: superClass.slice('schema:'.length),
    validate: ajv.compile(validation),
    required,
    recommended,
    known: new Set([...required, ...recommended, ...optional]),
    edam,
  };
}

/** @param {unknown} value */
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

/**
 * Checks one JSON-LD node against a profile. Returns a list of problems; empty means it passes.
 * @param {Record<string, unknown>} node the node, with its `@context`
 * @param {ReturnType<typeof loadProfile>} profile
 * @param {{ recommended?: string[], extra?: string[] }} [options] `recommended`: the Recommended
 *   properties that must be present; `extra`: further schema.org properties that are allowed
 */
export function checkNode(node, profile, { recommended = [], extra = [] } = {}) {
  /** @type {string[]} */
  const problems = [];
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return ['not an object'];

  const context = /** @type {Record<string, unknown>} */ (node['@context']);
  if (context?.['@vocab'] !== SCHEMA_ORG || context?.dct !== DCT) {
    problems.push(`@context must set @vocab to ${SCHEMA_ORG} and dct to ${DCT}`);
  }
  if (node['@type'] !== profile.type) problems.push(`@type must be ${profile.type}`);
  if (typeof node['@id'] !== 'string' || !URL.canParse(node['@id'])) {
    problems.push('@id must be an absolute IRI');
  }
  const conformsTo = /** @type {Record<string, unknown> | undefined} */ (node['dct:conformsTo']);
  if (conformsTo?.['@id'] !== profile.url) {
    problems.push(`dct:conformsTo must be { "@id": "${profile.url}" }`);
  }

  for (const name of [...profile.required, ...recommended]) {
    const value = node[name];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      problems.push(
        `missing ${profile.required.includes(name) ? 'Minimum' : 'Recommended'} property ${name}`,
      );
    }
  }
  for (const name of recommended) {
    if (!profile.recommended.includes(name)) problems.push(`${name} is not Recommended`);
  }

  const allowed = new Set(['@context', '@type', '@id', 'dct:conformsTo', ...extra]);
  for (const name of Object.keys(node)) {
    if (!profile.known.has(name) && !allowed.has(name)) problems.push(`unknown property ${name}`);
  }

  for (const [name, kind] of Object.entries(profile.edam)) {
    if (node[name] === undefined) continue;
    const pattern = new RegExp(`^http://edamontology\\.org/${kind}_\\d{4}$`);
    for (const term of asArray(node[name])) {
      const iri = typeof term === 'string' ? term : term?.['@id'];
      if (typeof iri !== 'string' || !pattern.test(iri)) {
        problems.push(`${name}: ${JSON.stringify(iri)} is not an EDAM ${kind} IRI`);
      }
    }
  }

  // The JSON schema doesn't know the JSON-LD keywords; leave them out.
  const data = Object.fromEntries(
    Object.entries(node).filter(([name]) => !allowed.has(name) || extra.includes(name)),
  );
  if (!profile.validate(data)) {
    for (const error of profile.validate.errors ?? []) {
      problems.push(`schema: ${error.instancePath || '/'} ${error.message}`);
    }
  }
  return problems;
}
