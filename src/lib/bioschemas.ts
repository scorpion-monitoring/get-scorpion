// Builds the Bioschemas ComputationalTool 1.0-RELEASE markup of Scorpion (docs/plan.md §7): one
// schema.org SoftwareApplication node per page, with `dct:conformsTo` the profile, and its name,
// description and `inLanguage` in the page locale.
//
// Pure functions over plain data: src/components/StructuredData.astro passes the content
// collections, and scripts/bioschemas.test.mjs passes the same YAML files, parsed directly. Only
// imports jsonld.ts, so Node can load this file from a script (it strips the types).
// scripts/lib/bioschemas.mjs checks the result against the profile.
import { JSONLD_CONTEXT } from './jsonld.ts';

export const COMPUTATIONAL_TOOL_PROFILE =
  'https://bioschemas.org/profiles/ComputationalTool/1.0-RELEASE';

const EDAM = 'http://edamontology.org';

/** An entry id, as written in YAML (`ipk`) or as an Astro collection reference (`{ id: 'ipk' }`). */
export type Ref = string | { id: string };

export interface EdamTerm {
  id: string;
  name: string;
}

export interface Organisation {
  name: string;
  url: string;
  ror?: string | undefined;
}

export interface Person {
  name: string;
  orcid: string;
}

/** The `scorpion` entry of src/data/software.yaml (schema in src/content.config.ts). */
export interface SoftwareEntry {
  name: string;
  /** Message key. */
  description: string;
  applicationCategory: string[];
  topics: EdamTerm[];
  operations: EdamTerm[];
  keywords: string[];
  license: string;
  codeRepository: Ref;
  softwareHelp: Ref;
  authors: ({ organisation: Ref } | { person: Person })[];
  providers: Ref[];
  funders: Ref[];
  citations: { doi: string; title: string }[];
}

/** Where the references in a SoftwareEntry point, for one page. */
export interface Sources {
  /** funders.yaml by id. */
  organisations: Record<string, Organisation>;
  /** links.yaml by id, with the URL for the page locale. */
  links: Record<string, string>;
  /** Renders a message key in the page locale. */
  text: (key: string) => string;
}

export interface ToolPage {
  /** `@id` of the software: the same on every locale's page, as it is one thing. */
  id: string;
  /** The page's absolute URL. */
  url: string;
  /** BCP 47 language of the page, for example `de`. */
  locale: string;
  /** The pinned release, for example `0.16.1`. */
  version: string;
}

function refId(ref: Ref): string {
  return typeof ref === 'string' ? ref : ref.id;
}

function lookup<T>(table: Record<string, T>, ref: Ref, what: string): T {
  const value = table[refId(ref)];
  if (value === undefined) throw new Error(`Bioschemas: unknown ${what} "${refId(ref)}"`);
  return value;
}

function organisation(org: Organisation) {
  return {
    '@type': 'Organization',
    ...(org.ror ? { '@id': org.ror, identifier: org.ror } : {}),
    name: org.name,
    url: org.url,
  };
}

function person(p: Person) {
  const orcid = `https://orcid.org/${p.orcid}`;
  return { '@type': 'Person', '@id': orcid, identifier: orcid, name: p.name };
}

function edamTerm(term: EdamTerm) {
  const iri = `${EDAM}/${term.id}`;
  return {
    '@type': 'DefinedTerm',
    '@id': iri,
    name: term.name,
    url: iri,
    termCode: term.id,
    inDefinedTermSet: EDAM,
  };
}

/** The ComputationalTool JSON-LD document (with `@context`) for one page. */
export function computationalTool(software: SoftwareEntry, sources: Sources, page: ToolPage) {
  const org = (ref: Ref) => organisation(lookup(sources.organisations, ref, 'organisation'));
  const link = (ref: Ref) => lookup(sources.links, ref, 'link');
  return {
    '@context': JSONLD_CONTEXT,
    '@type': 'SoftwareApplication',
    '@id': page.id,
    'dct:conformsTo': { '@id': COMPUTATIONAL_TOOL_PROFILE, '@type': 'CreativeWork' },
    name: software.name,
    description: sources.text(software.description),
    url: page.url,
    inLanguage: page.locale,
    applicationCategory: software.applicationCategory,
    applicationSubCategory: software.topics.map(edamTerm),
    featureList: software.operations.map(edamTerm),
    softwareVersion: page.version,
    license: software.license,
    isAccessibleForFree: true,
    codeRepository: link(software.codeRepository),
    softwareHelp: { '@type': 'CreativeWork', url: link(software.softwareHelp) },
    author: software.authors.map((a) =>
      'organisation' in a ? org(a.organisation) : person(a.person),
    ),
    provider: software.providers.map(org),
    funder: software.funders.map(org),
    citation: software.citations.map((c) => {
      const doi = `https://doi.org/${c.doi}`;
      return { '@type': 'ScholarlyArticle', '@id': doi, identifier: doi, url: doi, name: c.title };
    }),
    keywords: software.keywords,
  };
}
