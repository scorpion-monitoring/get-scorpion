# get-scorpion

The public landing page of [Scorpion](https://github.com/scorpion-monitoring/scorpion) at
<https://scorpion.bi.denbi.de/>, in English (`/`) and German (`/de/`).

The page introduces Scorpion, links to the docs, the demo instance and the releases, lists the
instances that run it (de.NBI / ELIXIR-DE at `/denbi/`, the NFDI consortia at `/nfdi/`) and the
organisations that fund and host it, and shows upcoming events.

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

A weekly workflow opens a pull request when there is a newer Scorpion release; to bump by hand, run
`pnpm bump-release` (see [CONTRIBUTING.md](CONTRIBUTING.md#bump-the-scorpion-release)).

Before you open a pull request, run the checks that CI runs:

```sh
pnpm format:check
pnpm lint          # ESLint
pnpm events:check  # validates events/*.yaml against events/events.schema.json and the event rules
pnpm test          # unit tests (node --test): events feed and events.jsonld (Bioschemas), structured data, Open Graph images
pnpm check         # message key parity (EN/DE), then astro check: types, message keys, data files
```

After `pnpm build`, CI also checks the built site (how to install Chromium and lychee, and how to
read a failure: [CONTRIBUTING.md](CONTRIBUTING.md#run-the-quality-checks-locally)):

```sh
pnpm check:html    # html-validate on dist/
pnpm check:links   # lychee offline: internal links and fragments in dist/
pnpm check:browser # Playwright + axe-core: / and /de/, light and dark, 375 and 1280 px
```

Scheduled workflows also run `pnpm check:links:online` (the external links in `src/data/`, daily)
and `pnpm check:theme-drift` (the themes against the application's latest release, weekly).

`pnpm build` ends with `scripts/check-dist.mjs`, which checks the built pages: no inline styles, no
inline script apart from the one JSON-LD block, canonical and Open Graph URLs, the Bioschemas markup
against its profile, the link to `events.jsonld` and the empty fallbacks in `/events/`, `robots.txt`
and `sitemap.xml`.

`pnpm og-images` makes the Open Graph images (`public/og/{en,de}.png`) and the favicons, which are
committed. Run it after changing the hero title, the logo or the script; `pnpm test` fails until you
do. It downloads the Inter font once (pinned by sha256), so it needs network access the first time.
See [CONTRIBUTING.md](CONTRIBUTING.md#change-the-meta-texts-or-the-open-graph-image).

`pnpm events:build` validates the events and writes the feed, without past events, to the
git-ignored `.cache/events/events.json`, and next to it `events.jsonld`, the Bioschemas markup of the
same events that [ELIXIR TeSS](https://tess.elixir-europe.org/) harvests (events with `tess: false`
left out). Options: `--out <file>` and `--out-jsonld <file>` for other paths, `--now <date-time>` to
build them for another moment, `--check-feed <file>` and `--check-jsonld <file>` to validate a
published file. The page reads `/events/events.json` at runtime; locally that is the empty fallback in
`public/events/`, so the Upcoming events section stays hidden. To see it, copy a built feed there for
a moment (don't commit it). An event's card has the id `event-<id>`, so
`http://localhost:4321/#event-<id>` opens it. How to add an event and register the TeSS source:
[CONTRIBUTING.md](CONTRIBUTING.md#add-an-event).

The English and German texts are in [messages/](messages/) (see [CONTRIBUTING.md](CONTRIBUTING.md)).
The page follows the system colour scheme (`prefers-color-scheme`); to see the dark theme, switch
your system or browser to dark mode.

## Deploy

`docker/Dockerfile` builds two images ([docs/plan.md](docs/plan.md) §9):

- `web` (default target): nginx on port 8080 as a non-root user, with a read-only root filesystem
  (`/tmp` must be writable). It sets every security header itself (CSP, HSTS, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`; [docker/security-headers.conf](docker/security-headers.conf))
  and answers `/healthz`.
- `events`: [scripts/fetch-events.mjs](scripts/fetch-events.mjs), the sidecar that keeps
  `/srv/events/events.json` and `events.jsonld` current from the `events` release every 15 minutes.
  The web container serves `/events/` from that shared volume, with the image's empty feeds as the
  fallback.

Run both locally:

```sh
docker build -f docker/Dockerfile -t get-scorpion .
docker build -f docker/Dockerfile --target events -t get-scorpion-events .
docker volume create get-scorpion-events
docker run --rm -v get-scorpion-events:/srv/events -u 0 --entrypoint chown get-scorpion-events 1000:1000 /srv/events
docker run -d --name get-scorpion-events -v get-scorpion-events:/srv/events get-scorpion-events
docker run --rm --read-only --tmpfs /tmp -v get-scorpion-events:/srv/events:ro -p 8080:8080 get-scorpion
```

`release.yml` pushes both images to ghcr.io on every push to `main` (tags: commit sha and `latest`,
with SBOM and a signed provenance attestation). Production runs on the de.NBI Cloud Bielefeld RKE2
cluster; the deployment, its pins and the route for `/` live in the infrastructure repository.

## Contributing, security and licence

- [CONTRIBUTING.md](CONTRIBUTING.md): workflow, the quality checks, adding an event, registering
  the TeSS source, link check failures, the bump pull request and theme drift, changing a logo.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.
- Code: [ISC](LICENSE). Logos and screenshots are **not** covered by the ISC licence; see
  [ASSETS.md](ASSETS.md).
