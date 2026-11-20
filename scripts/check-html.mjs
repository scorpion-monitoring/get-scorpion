// `pnpm check:html`: html-validate on every page in dist/ (docs/plan.md §8), with the rules in
// .htmlvalidate.mjs. Run it after `pnpm build`.
//
// EXCEPTIONS lists the only findings allowed, each for one rule on one element (by html-validate's
// selector) and with its reason. An exception that no longer matches anything fails too, so the list
// can't go stale. The JSON-LD block (§6) needs none: html-validate accepts a data block.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FileSystemConfigLoader, HtmlValidate } from 'html-validate';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

const EXCEPTIONS = [
  {
    rule: 'empty-heading',
    selector: '#events > template > li > h3',
    // The card template of the events section (§4). Template content is inert and never shown;
    // src/scripts/events.ts fills the heading of each copy with the event title. The browser checks
    // (scripts/check-browser.mjs) run axe on the rendered cards.
    reason: 'heading in the events <template>, filled by the events script',
  },
];

const files = readdirSync(DIST, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.html'))
  .sort();
if (files.length === 0) {
  console.error('check-html: no HTML files in dist/; run `pnpm build` first');
  process.exit(1);
}

const validator = new HtmlValidate(new FileSystemConfigLoader());
const used = new Set();
const problems = [];
for (const name of files) {
  const report = await validator.validateFile(join(DIST, name));
  for (const result of report.results) {
    for (const message of result.messages) {
      const exception = EXCEPTIONS.find(
        (e) => e.rule === message.ruleId && e.selector === message.selector,
      );
      if (exception) {
        used.add(exception);
        continue;
      }
      problems.push(
        `${relative(ROOT, result.filePath)}:${message.line}:${message.column} ` +
          `${message.ruleId}: ${message.message} (${message.selector ?? 'no selector'})`,
      );
    }
  }
}
for (const exception of EXCEPTIONS) {
  if (!used.has(exception)) {
    problems.push(
      `stale exception: ${exception.rule} on ${exception.selector} no longer occurs; remove it`,
    );
  }
}

if (problems.length > 0) {
  console.error(`check-html: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-html: ${files.length} page(s) valid (${EXCEPTIONS.length} documented exception(s))`,
);
