// @ts-check
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  output: 'static',
  site: 'https://scorpion.bi.denbi.de',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // Keeps `style-src 'self'` in the CSP possible (docs/plan.md §6).
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Astro inlines a processed <script> that imports nothing and is smaller than this limit
      // (astro/dist/core/build/plugins/plugin-scripts.js), which `script-src 'self'` would block.
      // Never inline JavaScript, so the events script stays an external, hashed file; other
      // assets keep Vite's default (undefined = 4 KB) (docs/plan.md §6).
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
    plugins: [
      tailwindcss(),
      // Compiles messages/*.json to typed message functions in src/paraglide/ at build time.
      // Pages pass the locale to every message call, so no locale strategy or middleware is needed.
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        emitTsDeclarations: true,
      }),
    ],
  },
});
