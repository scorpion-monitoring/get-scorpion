// Fails when messages/en.json and messages/de.json don't have the same keys. Paraglide falls back
// to English for a key missing from de.json without any warning, so this check runs before
// `astro check` (`pnpm check`).
import { readFile } from 'node:fs/promises';

const locales = ['en', 'de'];

const keys = {};
for (const locale of locales) {
  const file = new URL(`../messages/${locale}.json`, import.meta.url);
  const messages = JSON.parse(await readFile(file, 'utf8'));
  keys[locale] = new Set(Object.keys(messages).filter((key) => key !== '$schema'));
}

let failed = false;
for (const locale of locales) {
  for (const other of locales) {
    if (other === locale) continue;
    const missing = [...keys[other]].filter((key) => !keys[locale].has(key));
    if (missing.length > 0) {
      failed = true;
      console.error(
        `messages/${locale}.json is missing ${missing.length} key(s) from messages/${other}.json:`,
      );
      for (const key of missing) console.error(`  - ${key}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`messages: ${locales.join(', ')} have the same ${keys[locales[0]].size} keys`);
}
