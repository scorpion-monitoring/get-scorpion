// Reads what scripts/fetch-docs-export.mjs writes into the git-ignored src/assets/generated/
// (docs/plan.md §3). The files are read through import.meta.glob, which is empty until the script
// has run, so `pnpm check` works on a fresh clone without them; rendering the page (`pnpm build`,
// `pnpm dev`, which run the script first) fails with a clear message if they are missing.
import type { ImageMetadata } from 'astro';

const HINT = 'run `pnpm fetch-docs-export` (`pnpm build` and `pnpm dev` do this first)';

const docsExport = import.meta.glob<{ scorpionVersion: string }>(
  '../assets/generated/docs-export.json',
  { eager: true, import: 'default' },
);

const images = import.meta.glob<ImageMetadata>(
  ['../assets/generated/screenshots/*/*.png', '../assets/generated/badges/*.svg'],
  { eager: true, import: 'default' },
);

interface BadgeData {
  file: string;
}
interface Badges {
  /** Day of the download, YYYY-MM-DD (UTC). */
  date: string;
  bestPractices:
    | (BadgeData & { level: 'passing' | 'silver' | 'gold' })
    | (BadgeData & { level: 'in_progress'; percent: number })
    | null;
  scorecard: (BadgeData & { score: number }) | null;
}

const badgesFile = import.meta.glob<Badges>('../assets/generated/badges.json', {
  eager: true,
  import: 'default',
});

function only<T>(files: Record<string, T>, name: string): T {
  const [value] = Object.values(files);
  if (value === undefined) throw new Error(`src/assets/generated/${name} is missing; ${HINT}`);
  return value;
}

function image(path: string): ImageMetadata {
  const value = images[`../assets/generated/${path}`];
  if (!value) throw new Error(`src/assets/generated/${path} is missing; ${HINT}`);
  return value;
}

/** The pinned application release, as the docs export states it. */
export function getRelease() {
  const { scorpionVersion: version } = only(docsExport, 'docs-export.json');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Unexpected Scorpion version ${version}`);
  return { version, tag: `v${version}` };
}

/** The light and dark image of a screenshot pair mapped in src/data/screenshots.yaml. */
export function getScreenshot(journey: string, slug: string) {
  return {
    light: image(`screenshots/${journey}/${slug}.light.png`),
    dark: image(`screenshots/${journey}/${slug}.dark.png`),
  };
}

/**
 * The OpenSSF badges as downloaded at build time. A badge is null when its download failed; the
 * page then shows a text link (docs/plan.md §12.10).
 */
export function getBadges() {
  const badges = only(badgesFile, 'badges.json');
  return {
    date: badges.date,
    bestPractices: badges.bestPractices && {
      ...badges.bestPractices,
      image: image(`badges/${badges.bestPractices.file}`),
    },
    scorecard: badges.scorecard && {
      ...badges.scorecard,
      image: image(`badges/${badges.scorecard.file}`),
    },
  };
}
