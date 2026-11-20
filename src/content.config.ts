// Content collections for the structured page data in src/data/ (docs/plan.md §2). Each YAML file is
// a map from an entry id to its fields, so an entry can't lose its id. A bad entry (a wrong field, a
// URL that isn't https:, an unknown message key) fails `pnpm check` and `pnpm build`; a missing logo
// file and a YAML syntax error fail `pnpm build`.
//
// Text shown on the page is not stored here: fields ending in a message key (`label`, `description`,
// `alt`, `role`) name a key in messages/en.json, and the page renders it in the page locale. Only
// proper names that are not translated (organisation names) are stored as text.
import { defineCollection, type SchemaContext } from 'astro:content';
import { file, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import en from '../messages/en.json';

const messageKeys = new Set(Object.keys(en).filter((key) => key !== '$schema'));

/** A key that exists in messages/en.json (scripts/check-messages.mjs keeps de.json in step). */
const messageKey = z.string().refine((key) => messageKeys.has(key), {
  error: (issue) =>
    `Unknown message key "${String(issue.input)}"; add it to messages/en.json and messages/de.json`,
});

const httpsUrl = z.url({ protocol: /^https$/, error: 'Must be an https: URL' });

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

const links = defineCollection({
  loader: strictFile('src/data/links.yaml'),
  schema: z.strictObject({
    url: httpsUrl,
    /** Message key of the link text. */
    label: messageKey,
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

export const collections = { links, instances, funders, screenshots };
