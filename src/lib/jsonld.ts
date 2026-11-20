// JSON-LD helpers (docs/plan.md §6, §7). Imports nothing, so scripts and tests can import this file
// directly (Node strips the types); scripts/build-events.mjs uses it for events.jsonld (§4).

/**
 * The `@context` of our JSON-LD: schema.org as the vocabulary, plus the `dct` prefix for
 * `dct:conformsTo`, which Bioschemas uses to name the profile.
 */
export const JSONLD_CONTEXT = {
  '@vocab': 'https://schema.org/',
  dct: 'http://purl.org/dc/terms/',
} as const;

/**
 * Serialises a JSON-LD document for an inline `<script type="application/ld+json">` block.
 *
 * The block's content ends at the first `</script`, whatever the JSON says, so every `<` is written
 * as the JSON escape `<`. The result is still the same JSON (JSON.parse gives the same value),
 * but no text from the data can end the element or open a comment. This is the only inline block
 * the pages may carry (§6). events.jsonld is serialised the same way (with `space` 2), so even a
 * client that treats it as HTML can't be made to create an element.
 */
export function serializeJsonLd(value: unknown, space?: number): string {
  const json = JSON.stringify(value, null, space);
  if (json === undefined) throw new Error('JSON-LD value is not serialisable');
  return json.replaceAll('<', '\\u003c');
}
