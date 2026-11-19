// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', '.astro/', 'src/paraglide/', 'project.inlang/cache/']),
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  {
    // Config files and build scripts run in Node.
    files: ['*.{js,mjs,ts}', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
);
