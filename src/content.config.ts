// Content collections for the structured page data in src/data/ (docs/plan.md §2). Each YAML file is
// a map from an entry id to its fields, so an entry can't lose its id. A bad entry (a wrong field, a
// URL that isn't https:, an unknown message key) fails `pnpm check` and `pnpm build`; a missing logo
// file and a YAML syntax error fail `pnpm build`.
//
// Text shown on the page is not stored here: fields ending in a message key (`label`, `description`,
// `alt`, `role`) name a key in messages/en.json, and the page renders it in the page locale. Only
// proper names that are not translated (organisation names) are stored as text.
import { defineCollection, reference, type SchemaContext } from 'astro:content';
import { file, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import en from '../messages/en.json';

const messageKeys = new Set(Object.keys(en).filter((key) => key !== '$schema'));

/** A key that exists in messages/en.json (scripts/check-messages.mjs keeps de.json in step). */
const messageKey = z.string().refine((key) => messageKeys.has(key), {
  error: (issue) =>
    `Unknown message key "${String(issue.input)}"; add it to messages/en.json and messages/de.json`,
});

const httpsUrl = z.url({
  protocol: /^https$/,
  error: (issue) => (issue.input === undefined ? 'Missing URL' : 'Must be an https: URL'),
});

/** Display order on the page, lowest first. */
const order = z.number().int().nonnegative();

/**
 * A logo. Without `src` the page shows a neutral placeholder (the organisation name in a bordered
 * box) at the same size and with the same alt text. To use the real logo once permission is
 * recorded in ASSETS.md, add `src` (and `dark` if needed); nothing else changes.
 */
const logo = ({ image }: SchemaContext) =>
  z
    .strictObject({
      /** Path to the file, relative to the YAML file, for example `../assets/logos/dfg.svg`. */
      src: image().optional(),
      /** Variant for the dark theme, used through `prefers-color-scheme: dark`. */
      dark: image().optional(),
      /** Message key of the alt text, for example "de.NBI / ELIXIR-DE logo". */
      alt: messageKey,
      /** The box the logo is fitted into, in CSS pixels. The placeholder takes exactly this size. */
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .refine((l) => l.src || !l.dark, { error: 'A dark variant needs `src` as well' });

/**
 * Astro's `file()` loader, but a file that is missing or can't be parsed fails the build. `file()`
 * itself only logs an error then and keeps the entries from its cache, so a YAML syntax error would
 * leave stale data on the page.
 */
function strictFile(fileName: string): Loader {
  const loader = file(fileName);
  return {
    ...loader,
    load: async (context) => {
      const errors: string[] = [];
      const logger = Object.create(context.logger) as typeof context.logger;
      logger.error = (message) => {
        errors.push(message);
        context.logger.error(message);
      };
      // `file()` logs the parser's message at debug level right after the error.
      logger.debug = (message) => {
        if (errors.length > 0) errors.push(message);
        context.logger.debug(message);
      };
      await loader.load({ ...context, logger });
      if (errors.length > 0) throw new Error(errors.join('\n'));
    },
  };
}

/**
 * One https: URL per page locale. Both are required, so a missing locale fails `pnpm check`. Keep
 * the keys in step with `locales` in project.inlang/settings.json.
 */
const urlPerLocale = z.strictObject({ en: httpsUrl, de: httpsUrl });

/**
 * A link has either one `url` for every locale, or `urls` with one URL per locale (for pages that
 * exist in both languages, such as the IPK imprint). src/lib/data.ts picks the page locale's URL.
 */
const links = defineCollection({
  loader: strictFile('src/data/links.yaml'),
  schema: z
    .strictObject({
      url: httpsUrl.optional(),
      urls: urlPerLocale.optional(),
      /** Message key of the link text. */
      label: messageKey,
    })
    .refine((l) => (l.url === undefined) !== (l.urls === undefined), {
      error: 'A link needs exactly one of `url` (all locales) and `urls` (one per locale)',
    }),
});

const instances = defineCollection({
  loader: strictFile('src/data/instances.yaml'),
  schema: (ctx) =>
    z.strictObject({
      order,
      name: z.string().min(1),
      url: httpsUrl,
      /** Message key of the one-line description. */
      description: messageKey,
      logo: logo(ctx),
    }),
});

const funders = defineCollection({
  loader: strictFile('src/data/funders.yaml'),
  schema: (ctx) =>
    z.strictObject({
      order,
      name: z.string().min(1),
      url: httpsUrl,
      /** Message key of the role, for example "Powered by". */
      role: messageKey,
      logo: logo(ctx),
      /** ROR id as a URL, for the structured data (docs/plan.md §7). Look it up on ror.org. */
      ror: z
        .string()
        .regex(/^https:\/\/ror\.org\/0[a-z0-9]{6}[0-9]{2}$/, {
          error: 'A ROR id URL like https://ror.org/02skbsp27',
        })
        .optional(),
    }),
});

/**
 * The screenshot of a feature card: a light/dark pair from the docs export of the release pinned in
 * scorpion-release.json (docs/plan.md §3). The entry id is the feature card id. Whether the pair
 * exists upstream is checked by scripts/fetch-docs-export.mjs, which fails the build otherwise.
 */
const screenshots = defineCollection({
  loader: strictFile('src/data/screenshots.yaml'),
  schema: z.strictObject({
    /** Journey id in screenshots.json, for example `j07`. */
    journey: z.string().regex(/^j\d{2}$/, { error: 'A journey id like j07' }),
    /** Screenshot slug, unique only within its journey, for example `service-after-edit`. */
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'A slug like service-after-edit' }),
    /** Message key of the alt text, which describes what the screenshot shows. */
    alt: messageKey,
  }),
});

/** An EDAM concept: `id` like topic_0605 or operation_3760, `name` its preferred label in EDAM. */
const edamTerm = (kind: 'topic' | 'operation') =>
  z.strictObject({
    id: z.string().regex(new RegExp(`^${kind}_\\d{4}$`), { error: `An EDAM id like ${kind}_0001` }),
    name: z.string().min(1),
  });

/**
 * What the Bioschemas ComputationalTool markup says about Scorpion (docs/plan.md §7). The one entry
 * is `scorpion`. Organisations are ids in funders.yaml and URLs are ids in links.yaml, so no value
 * is repeated here; the version comes from the docs export.
 */
const software = defineCollection({
  loader: strictFile('src/data/software.yaml'),
  schema: z.strictObject({
    name: z.string().min(1),
    /** Message key of the description, in the page locale. */
    description: messageKey,
    /** bio.tools tool types, for example "Database portal". */
    applicationCategory: z.array(z.string().min(1)).min(1),
    /** EDAM topics (applicationSubCategory). */
    topics: z.array(edamTerm('topic')).min(1),
    /** EDAM operations (featureList). */
    operations: z.array(edamTerm('operation')).min(1),
    keywords: z.array(z.string().min(1)).min(1),
    /** SPDX licence URL. */
    license: z.string().regex(/^https:\/\/spdx\.org\/licenses\/[A-Za-z0-9.+-]+$/, {
      error: 'An SPDX URL like https://spdx.org/licenses/ISC',
    }),
    /** Links (ids in links.yaml). */
    codeRepository: reference('links'),
    softwareHelp: reference('links'),
    authors: z
      .array(
        z.union([
          z.strictObject({ organisation: reference('funders') }),
          z.strictObject({
            person: z.strictObject({
              name: z.string().min(1),
              orcid: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, {
                error: 'An ORCID iD like 0000-0001-6546-1818',
              }),
            }),
          }),
        ]),
      )
      .min(1),
    providers: z.array(reference('funders')).min(1),
    funders: z.array(reference('funders')),
    citations: z.array(
      z.strictObject({
        doi: z.string().regex(/^10\.\d{4,9}\/\S+$/, { error: 'A DOI like 10.1515/jib-2025-0048' }),
        title: z.string().min(1),
      }),
    ),
  }),
});

export const collections = { links, instances, funders, screenshots, software };
