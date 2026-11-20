// html-validate on the built pages in dist/ (docs/plan.md §8). `pnpm check:html` runs it through
// scripts/check-html.mjs, which holds the per-element exceptions; this file holds the rules.
// Every rule change below needs a reason in a comment.
export default {
  root: true,
  extends: ['html-validate:recommended', 'html-validate:document'],
  rules: {
    // `html-validate:document` requires `integrity` on every script and stylesheet. Ours are all
    // same-origin, hashed files from /_astro/ (CSP `script-src 'self'`, §6), where SRI protects
    // against nothing a compromised origin couldn't also change. Keep it for anything cross-origin,
    // which §6 forbids anyway.
    'require-sri': ['error', { target: 'crossorigin' }],
  },
};
