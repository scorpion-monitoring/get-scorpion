# get-scorpion

The public landing page of [Scorpion](https://github.com/scorpion-monitoring/scorpion) at
<https://scorpion.bi.denbi.de/>, in English (`/`) and German (`/de/`).

The page introduces Scorpion, links to the docs, the demo instance and the releases, lists the
instances that run it (de.NBI / ELIXIR-DE at `/denbi/`, NFDI4Biodiversity and NFDI4Microbiota at
`/nfdi/`) and the organisations that fund and host it, and shows upcoming events.

## Why this is a separate repository

The landing page belongs to no single instance, and it carries the logos and names of the funders and
hosting organisations. The application must not carry these: under ADR-0050 of the application repo
(_"The software's own attribution is not instance branding"_), only Scorpion's own attribution is fixed
in the application code, and everything about an instance's identity comes from its settings.
Organisation logos and marketing copy therefore live here, outside the application, on purpose. The
application repo is not changed for the landing page.

## Plan

The reviewed plan, with the stack, the page sections, the events feed, CI and deployment, is in
[docs/plan.md](docs/plan.md). The work follows its milestones (§11), one pull request each.

## Run locally

You need Node.js from [.nvmrc](.nvmrc) (Node 26) and pnpm from `packageManager` in
[package.json](package.json). Node 25 and later no longer ship Corepack, so install it once with
`npm install --global corepack` before enabling it.

```sh
corepack enable    # provides the pinned pnpm version
pnpm install
pnpm dev           # development server at http://localhost:4321/ (German at /de/)
pnpm build         # static site in dist/
pnpm preview       # serves dist/ locally
```

`pnpm build` and `pnpm dev` first run `pnpm fetch-docs-export`, which needs network access to GitHub
and to the OpenSSF badge services. It downloads the `docs-export.zip` of the Scorpion release pinned in
[scorpion-release.json](scorpion-release.json), checks its sha256, and extracts the version and the
feature screenshots into the git-ignored `src/assets/generated/`; the zip is cached in
`node_modules/.cache/get-scorpion/`, so later builds work offline. The badges are downloaded on every
build; without them the page shows text links. `pnpm check` needs no network.

To move to a newer Scorpion release, run `pnpm bump-release` (see
[CONTRIBUTING.md](CONTRIBUTING.md#bump-the-scorpion-release)).

Before you open a pull request, run the checks that CI runs:

```sh
pnpm format:check
pnpm lint          # ESLint
pnpm events:check  # validates events/*.yaml against events/events.schema.json
pnpm test          # unit tests of the events feed (node --test)
pnpm check         # message key parity (EN/DE), then astro check: types, message keys, data files
```

`pnpm events:build` validates the events and writes the feed, without past events, to the
git-ignored `.cache/events/events.json` (`--out <file>` for another path, `--now <date-time>` to
build it for another moment). The page reads `/events/events.json` at runtime; locally that is the
empty fallback in `public/events/`, so the Upcoming events section stays hidden. To see it, copy a
built feed there for a moment (don't commit it). How to add an event:
[CONTRIBUTING.md](CONTRIBUTING.md#add-an-event).

The English and German texts are in [messages/](messages/) (see [CONTRIBUTING.md](CONTRIBUTING.md)).
The page follows the system colour scheme (`prefers-color-scheme`); to see the dark theme, switch
your system or browser to dark mode.

## Deploy

_Filled in with M8 (container and deployment)._

## Contributing, security and licence

- [CONTRIBUTING.md](CONTRIBUTING.md): workflow, adding an event, changing a logo.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.
- Code: [ISC](LICENSE). Logos and screenshots are **not** covered by the ISC licence; see
  [ASSETS.md](ASSETS.md).
