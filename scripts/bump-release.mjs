// `pnpm bump-release [vX.Y.Z]`: pins scorpion-release.json to the latest application release (or
// the given tag), with the sha256 of its docs-export.zip (docs/plan.md §3). Run it, then
// `pnpm build`, look at the page, and open a pull request with the changed file.
//
// GitHub reports no digest for the asset at the moment, so the hash is computed from this
// download; when GitHub does report one, it must match. Uses the API with GITHUB_TOKEN if it is
// set (the workflow sets it), otherwise without a token (60 requests an hour per IP address).
import { writeFile } from 'node:fs/promises';
import {
  ASSET_NAME,
  REPO,
  RELEASE_FILE,
  ZIP_LIMITS,
  assetUrl,
  cacheZip,
  checkDocsExport,
  download,
  extractEntries,
  githubApi,
  readRelease,
  sha256,
  validateRelease,
} from './fetch-docs-export.mjs';

const requested = process.argv[2];
const info = await githubApi(
  `/repos/${REPO}/releases/${requested ? `tags/${encodeURIComponent(requested)}` : 'latest'}`,
);
const asset = info.assets?.find((a) => a.name === ASSET_NAME);
if (!asset) throw new Error(`Release ${info.tag_name} has no ${ASSET_NAME}`);

const tag = info.tag_name;
const current = await readRelease();
const { body: zip } = await download(assetUrl(tag), { maxBytes: ZIP_LIMITS.zipBytes });
const hash = sha256(zip);
if (asset.digest && asset.digest !== `sha256:${hash}`) {
  throw new Error(`GitHub reports ${asset.digest} for ${ASSET_NAME}, the download has ${hash}`);
}
const next = validateRelease({ tag, sha256: hash });

// The same checks the build makes, so a bad release is noticed now and not in CI.
const files = await extractEntries(zip, ['docs-export.json']);
checkDocsExport(JSON.parse(files.get('docs-export.json').toString('utf8')), next.version);

await cacheZip(hash, zip);
await writeFile(RELEASE_FILE, `${JSON.stringify({ tag, sha256: hash }, null, 2)}\n`);
console.log(
  current.tag === tag && current.sha256 === hash
    ? `scorpion-release.json already pins ${tag}`
    : `scorpion-release.json: ${current.tag} -> ${tag} (sha256 ${hash})`,
);
