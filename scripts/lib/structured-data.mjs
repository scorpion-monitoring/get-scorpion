// What our ComputationalTool markup must satisfy, shared by scripts/bioschemas.test.mjs and
// scripts/check-dist.mjs (docs/plan.md §7).
import { join } from 'node:path';
import { COMPUTATIONAL_TOOL_PROFILE } from '../../src/lib/bioschemas.ts';
import { loadProfile } from './bioschemas.mjs';

const SCHEMA = join(import.meta.dirname, '../bioschemas/ComputationalTool_v1.0-RELEASE.json');

export function loadComputationalTool() {
  return loadProfile(SCHEMA, COMPUTATIONAL_TOOL_PROFILE);
}

/**
 * Options for checkNode(): all seven Recommended properties are filled (decisions of 2026-11-20),
 * and `inLanguage` (schema.org CreativeWork) is allowed in addition to the profile's properties.
 */
export const PROFILE_CHECK = {
  recommended: [
    'applicationCategory',
    'applicationSubCategory',
    'author',
    'citation',
    'featureList',
    'license',
    'softwareVersion',
  ],
  extra: ['inLanguage'],
};
