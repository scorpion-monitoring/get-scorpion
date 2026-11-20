// `pnpm og-images`: makes the Open Graph images and the favicons (docs/plan.md §7), which are
// committed in public/:
//
// - public/og/{en,de}.png: 1200×630, dark Scorpion theme, the scorpion mark, "Scorpion", the hero
//   title in that locale (messages/*.json) and the host name;
// - public/favicon.ico (16, 32 and 48 px) and public/apple-touch-icon.png (180 px): the scorpion
//   mark cut from the dark Scorpion logo (src/assets/logos/scorpion-dark.png).
//
// Text is turned into SVG paths with opentype.js and the Inter font, so the result doesn't depend on
// the fonts installed on the machine; sharp then rasterises the SVG. The font is used only here and
// is never served. It is downloaded from the Inter release, checked against a pinned sha256 and
// cached in node_modules/.cache/get-scorpion/ (it is not committed). `pnpm build` doesn't run this
// script and needs no network for it.
//
// scripts/og-images.json records a hash of every input (this script, the texts, the logo, the font)
// and of every output. `pnpm test` (scripts/og-images.test.mjs) fails when an input changed since
// the images were made, or an image was edited by hand: run `pnpm og-images` and commit the result.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';
import yauzl from 'yauzl';

const ROOT = join(import.meta.dirname, '..');
export const MANIFEST_FILE = join(ROOT, 'scripts/og-images.json');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/get-scorpion');
const LOGO = 'src/assets/logos/scorpion-dark.png';
/** The scorpion mark in the dark logo (370×128): the square at the right. */
const MARK = { left: 242, top: 0, width: 128, height: 128 };

export const LOCALES = ['en', 'de'];
/** Message keys shown in the image. */
const TEXT_KEYS = ['hero_title'];
const HOST = 'scorpion.bi.denbi.de';

/** Inter 4.1 (SIL Open Font License 1.1), https://github.com/rsms/inter/releases/tag/v4.1. */
const FONT = {
  url: 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip',
  sha256: '9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e',
  bytes: 40 * 1024 * 1024,
  bold: 'extras/ttf/Inter-Bold.ttf',
  regular: 'extras/ttf/Inter-Regular.ttf',
};

/** Colours of the scorpiondark theme (src/styles/app.css). */
const THEME = {
  base100: '#070c1e',
  base200: '#0e1738',
  content: '#e2e8f0',
  primary: '#00e5ff',
};

const WIDTH = 1200;
const HEIGHT = 630;

/** Paths of the outputs, relative to the repository root. */
export const OUTPUTS = [
  ...LOCALES.map((l) => `public/og/${l}.png`),
  'public/favicon.ico',
  'public/apple-touch-icon.png',
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Hash of everything the images are made from. */
export async function inputHash() {
  const texts = {};
  for (const locale of LOCALES) {
    const messages = JSON.parse(await readFile(join(ROOT, `messages/${locale}.json`), 'utf8'));
    texts[locale] = Object.fromEntries(TEXT_KEYS.map((k) => [k, messages[k]]));
  }
  return sha256(
    JSON.stringify({
      script: sha256(await readFile(new URL(import.meta.url))),
      logo: sha256(await readFile(join(ROOT, LOGO))),
      font: FONT.sha256,
      texts,
    }),
  );
}

export async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// Font

async function fontZip() {
  const file = join(CACHE_DIR, `inter-${FONT.sha256}.zip`);
  try {
    const cached = await readFile(file);
    if (sha256(cached) === FONT.sha256) return cached;
  } catch {
    // Not cached yet.
  }
  console.log(`Downloading ${FONT.url}`);
  const response = await fetch(FONT.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${FONT.url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > FONT.bytes) throw new Error(`${FONT.url}: larger than expected`);
  if (sha256(data) !== FONT.sha256) throw new Error(`${FONT.url}: sha256 mismatch`);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(`${file}.tmp`, data);
  await rename(`${file}.tmp`, file);
  return data;
}

/** Reads the named entries from the (verified) zip. */
function unzip(data, names) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const found = {};
      zip.on('error', reject);
      zip.on('end', () => {
        const missing = names.filter((n) => !found[n]);
        if (missing.length) reject(new Error(`Font zip lacks ${missing.join(', ')}`));
        else resolve(found);
      });
      zip.on('entry', (entry) => {
        if (!names.includes(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            found[entry.fileName] = Buffer.concat(chunks);
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function loadFonts() {
  const files = await unzip(await fontZip(), [FONT.bold, FONT.regular]);
  const parse = (buffer) =>
    opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length));
  return { bold: parse(files[FONT.bold]), regular: parse(files[FONT.regular]) };
}

// ---------------------------------------------------------------------------------------------
// Images

/**
 * Lays out text glyph by glyph: character map plus pair kerning, no glyph substitution.
 * opentype.js 2.0 can't apply Inter's `ccmp` lookups (GSUB lookup type 6, format 2), and the texts
 * need none: every character, umlauts included, has its own glyph. Returns the glyphs with their
 * x offsets in font units, and the advance width.
 */
function layout(font, text) {
  const glyphs = [...text].map((ch) => {
    const glyph = font.charToGlyph(ch);
    if (glyph.index === 0) throw new Error(`The font has no glyph for "${ch}"`);
    return glyph;
  });
  let x = 0;
  const placed = glyphs.map((glyph, i) => {
    const at = x;
    x += glyph.advanceWidth;
    if (i + 1 < glyphs.length) x += font.getKerningValue(glyph, glyphs[i + 1]);
    return { glyph, x: at };
  });
  return { placed, width: x };
}

function advance(font, text, size) {
  return (layout(font, text).width * size) / font.unitsPerEm;
}

/** Splits text into lines no wider than `width` at the given size. */
function wrap(font, text, size, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && advance(font, candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textPath(font, text, x, y, size, fill) {
  const scale = size / font.unitsPerEm;
  const d = layout(font, text)
    .placed.map(({ glyph, x: offset }) => glyph.getPath(x + offset * scale, y, size).toPathData(2))
    .join('');
  return `<path fill="${fill}" d="${d}"/>`;
}

async function mark(size) {
  return sharp(join(ROOT, LOGO))
    .extract(MARK)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function ogImage(fonts, texts) {
  const margin = 96;
  const markSize = 150;
  const markTop = 96;
  const title = 132;
  const subtitle = 60;
  const lines = wrap(fonts.regular, texts.hero_title, subtitle, WIDTH - 2 * margin);
  if (lines.length > 2) throw new Error(`"${texts.hero_title}" needs more than two lines`);
  const titleBaseline = markTop + markSize / 2 + title * 0.36;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${THEME.base100}"/>`,
    `<rect y="${HEIGHT - 150}" width="${WIDTH}" height="150" fill="${THEME.base200}"/>`,
    `<rect y="${HEIGHT - 12}" width="${WIDTH}" height="12" fill="${THEME.primary}"/>`,
    textPath(fonts.bold, 'Scorpion', margin + markSize + 36, titleBaseline, title, THEME.content),
    ...lines.map((line, i) =>
      textPath(fonts.regular, line, margin, 350 + i * 76, subtitle, THEME.primary),
    ),
    textPath(fonts.regular, HOST, margin, HEIGHT - 60, 40, THEME.content),
    '</svg>',
  ].join('');
  return sharp(Buffer.from(svg))
    .composite([{ input: await mark(markSize), left: margin, top: markTop }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An ICO file that holds PNG images (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function favicons() {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map(async (size) => ({
      size,
      data: await sharp(await mark(size))
        .png({ compressionLevel: 9, palette: true })
        .toBuffer(),
    })),
  );
  // iOS shows no transparency: put the mark on the theme background.
  const appleTouch = await sharp(await mark(180))
    .flatten({ background: THEME.base100 })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  return { 'public/favicon.ico': ico(pngs), 'public/apple-touch-icon.png': appleTouch };
}

async function main() {
  const fonts = await loadFonts();
  const outputs = {};
  for (const locale of LOCALES) {
    const messages = JSON.parse(await readFile(join(ROOT, `messages/${locale}.json`), 'utf8'));
    outputs[`public/og/${locale}.png`] = await ogImage(fonts, messages);
  }
  Object.assign(outputs, await favicons());
  for (const [path, data] of Object.entries(outputs)) {
    await mkdir(dirname(join(ROOT, path)), { recursive: true });
    await writeFile(join(ROOT, path), data);
    console.log(`Wrote ${path} (${data.length} bytes)`);
  }
  const manifest = {
    comment: 'Written by `pnpm og-images` (scripts/og-images.mjs); checked by `pnpm test`.',
    inputs: await inputHash(),
    outputs: Object.fromEntries(OUTPUTS.map((path) => [path, sha256(outputs[path])])),
  };
  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_FILE}`);
}

if (import.meta.main) await main();
