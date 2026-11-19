# Plan: Scorpion landing page (`get-scorpion`)

Status: reviewed, 2026-11-19. M1 (bootstrap) and M2 (scaffold) are done; corrections found during them are folded in below.

This is the public landing page at `https://scorpion.bi.denbi.de/`. It belongs to neither
instance (`/denbi/`, `/nfdi/`) and lives outside the application repo
(`scorpion-monitoring/scorpion`, ADR-0050). That decision is settled.

## 1. Decisions from the question round

| Topic             | Decision                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Stack             | Astro (static output), Tailwind CSS 4 and daisyUI 5                                                  |
| Repository        | `scorpion-monitoring/get-scorpion`, default branch `main` (created in M1)                            |
| Deployment        | Container image: unprivileged nginx serving `dist/`, published to GHCR                               |
| Events            | Runtime feed: adding an event must **not** need an image rebuild or container restart (see §4)       |
| Legal             | Link to IPK Gatersleben's imprint and privacy pages, choosing the EN or DE page to match the locale  |
| Docs / demo / get | Rebuild docs, demo at `https://test.scorpion.bi.denbi.de/`, "Get Scorpion" points to GitHub releases |
| Contact           | GitHub instead of a mailto link                                                                      |
| Languages         | English (default, at `/`) and German (`/de/`), using an i18n package                                 |

Facts checked on 2026-11-19:

- The application repo uses the **ISC** licence. Its default branch is `dev`, at commit `490d48d`.
- Its themes are `scorpionlight` and `scorpiondark` in `apps/web/src/app.css`. It uses only system font stacks, so there are no web fonts to self-host.
- v0.16.1 was released today. Releases come roughly daily.
- `docs-export.zip` holds `modules.json` (14 modules with internal names such as "Audit log" and "Blob store"), `docs-export.json` (`scorpionVersion`) and **`screenshots/` with light and dark PNGs** for each user journey.
- GitHub Discussions is **disabled** on the application repo. Issues are enabled.
- `/`, `/denbi/`, `/nfdi/`, `/denbi/docs` and the demo all return 200. `/denbi/catalog/services` returns **404**, so the live instance is probably still on an older version.
- The application repo's `docs/` folder holds design and sprint documents, not user documentation.

## 2. Page sections and content sources

The overall shape stays the same. Text marked "msg" lives in the i18n message files (EN and DE), and
structured data lives in `src/data/*.yaml`, validated by a Zod schema through Astro content collections.

| #   | Section             | Content                                                                                               | Source                                               |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Nav                 | Get Scorpion (releases), Docs, Contact (GitHub), GitHub icon (new repo), EN/DE switcher               | `src/data/links.yaml`, msg                           |
| 2   | Hero                | "Streamlining Federated KPI Monitoring", one paragraph, logo, and "Current release vX.Y.Z"            | msg; version from the docs export (§3)               |
| 3   | Get started         | User docs, API reference (`/denbi/docs`), Demo instance                                               | `links.yaml`, msg                                    |
| 4   | Upcoming events     | Rendered at runtime from `/events/events.json`; hidden when there are no upcoming events              | events feed (§4)                                     |
| 5   | Available instances | de.NBI / ELIXIR-DE and NFDI4Biodiversity + NFDI4Microbiota: logo, one line, "Visit"                   | `instances.yaml`, msg                                |
| 6   | Features            | About 9 cards (list below)                                                                            | msg (hand-written); screenshots from the docs export |
| 7   | Funding and support | de.NBI/ELIXIR-DE (powered by), IPK (hosted by), NFDI4Biodiversity (developed within), DFG (funded by) | `funders.yaml`                                       |
| 8   | Footer              | Logo, docs, GitHub, imprint and privacy (IPK, per locale), "Contact via GitHub", release line         | `links.yaml`, msg                                    |

**Feature cards (draft wording, for your confirmation; nothing beyond the handover list):**

1. Service registry: licence, stage, description, `sameAs` links and contacts; organisations with ROR ids.
2. KPI framework aligned with RIMO: indicators with value types and units; KPI sets per service.
3. Measurement submission: in the web UI or through the API; one validated value per service, indicator and month.
4. Analytics and dashboards: month-by-month values, change, average and volatility; exports.
5. Impact assessment: consortium-level figures (services per stage, open-source share, yearly headline KPIs).
6. Public catalogue: searchable published services; schema.org and RIMO exports (Turtle, JSON-LD).
7. Public REST API v1: OpenAPI reference at `<instance>/docs`; personal access tokens.
8. Sign-in and access: institutional OpenID Connect or local accounts; role-based access; provider membership.
9. Notifications, inbox and audit trail.
10. Per-instance branding: name, logos, theme colours and legal texts.
11. Security assurance: a self-assessment against OWASP ASVS 5.0 L2 for authentication, sessions, authorisation and OIDC, **in progress**. The OpenSSF Best Practices badge and Scorecard are shown as live badges served from our own origin (see §6). The page never says the level is reached.

Cards 1 to 6 get a screenshot. Cards 7 to 11 get an icon (Lucide, ISC, inlined SVG). This **drops the
undraw illustrations**: real screenshots are accurate, and they come in light and dark versions.

## 3. Using the docs export

Recommendation: **read it at build time, but only for the version line and the screenshots.**
Keep the feature text hand-written. The module `displayName`s are internal ("Blob store", "Web shell") and
make poor marketing copy.

- `scorpion-release.json` pins `{ tag, sha256 }` of `docs-export.zip`.
- `scripts/fetch-docs-export.mjs` downloads the zip from the GitHub release at build time and checks the hash. It extracts `docs-export.json` and the selected screenshots into a git-ignored `src/assets/generated/`. Opening the zip as untrusted data means rejecting paths with `..` and limiting the size.
- `src/data/screenshots.yaml` maps each feature card to a screenshot slug. The build fails when a slug disappears, so a rename upstream is noticed.
- A scheduled workflow (weekly, plus `workflow_dispatch`) opens a PR that bumps `scorpion-release.json` to the latest release. With daily releases this keeps PR noise at one a week.
- Nothing is fetched at runtime.

## 4. Events feed (no restart)

- **Source of truth:** one YAML file per event in `events/` in this repo. Fields: `id, start, end, title{en,de}, summary{en,de}, location, url (https only)`. They are validated against `events/events.schema.json` in CI.
- **Publish:** on a push to `main` that touches `events/`, CI builds `events.json` (sorted, past events removed) and uploads it as an asset of a rolling GitHub release called `events`.
- **Deliver:** the image serves `/events/` from a **mounted volume**. A small timer on the host fetches the asset every 15 minutes, checks that it parses and matches the schema, and replaces the file atomically. nginx serves the new file on the next request, with no restart. Visitors' browsers only ever request our own origin. The alternative is a sidecar container in place of the host timer, depending on how the host is run (open point).
- **Fallback:** the image includes an empty `events.json`, so the section stays hidden if the mount is missing.
- **Render:** an external script of about 2 KB (`script-src 'self'`) fetches `/events/events.json` with `cache: 'no-cache'`. It drops events whose `end` has passed (so stale data hides itself) and formats dates with `Intl.DateTimeFormat` in the page locale. It builds the DOM with `textContent` only and then removes `hidden` from the section. Without JavaScript the section stays hidden. This is the page's only JavaScript apart from the language switcher, which is a plain link.

## 5. Project structure, build and preview

```
astro.config.mjs        # output: 'static', site, i18n { defaultLocale: 'en', locales: ['en','de'], routing: { prefixDefaultLocale: false } }
messages/{en,de}.json   # Paraglide JS (inlang) messages, compiled, typed, tree-shaken
project.inlang/         # Paraglide project settings; the message-format plugin is loaded from node_modules, not a CDN
src/pages/index.astro, src/pages/de/index.astro   # both render <Landing locale=…>
src/components/         # Nav, Hero, GetStarted, Events, Instances, Features, Funding, Footer, LangSwitch
src/data/               # links.yaml, instances.yaml, funders.yaml, screenshots.yaml
src/assets/logos/       # SVG logos (light/dark variants where needed)
src/styles/app.css      # Tailwind + daisyUI with both Scorpion themes (copied, see §6)
src/scripts/events.ts
events/                 # *.yaml + events.schema.json
scripts/                # fetch-docs-export.mjs, build-events.mjs, check-theme-drift.mjs
docker/                 # Dockerfile, nginx.conf
public/                 # robots.txt, favicon.svg, events/events.json (empty fallback)
```

- i18n: Astro's built-in i18n routing combined with **Paraglide JS 3** for strings (maintained, compile-time, no runtime loader). Checked in M2 (§12.9), with these findings:
  - Paraglide 3.0 came out on 2026-11-03, and the 2.x line had its last release on 2026-10-28, so we use 3.x. The 3.0 breaking changes (`additionalFiles` and middleware locale splitting removed, Vite output as virtual modules) don't affect a static page.
  - No adapter package: `@inlang/paraglide-astro` is deprecated on npm. The Vite plugin from `@inlang/paraglide-js` goes into `astro.config.mjs` under `vite.plugins`.
  - Each page passes its locale to every message call (`m.key({}, { locale })`). This needs no locale strategy, no `setLocale()` and no Astro middleware, and it works with `prefixDefaultLocale: false`. (Paraglide's own SSG guide assumes a prefix for every locale and a middleware.)
  - `paraglide-js init` points `project.inlang/settings.json` at plugin modules on jsDelivr, which would fetch unpinned code at every build. Instead `@inlang/plugin-message-format` is a dev dependency, pinned by the lockfile, and `modules` names its file in `node_modules`. Module paths resolve from the repository root, not from `project.inlang/`. A wrong path is only a warning, but then every message is missing and `pnpm check` fails.
  - A key missing from one locale's file falls back to English without a warning. A key-parity check for `messages/` is a candidate for M7.
  - The output has no inline `<script>`, `<style>` or `style=""`. The built HTML has no script at all, and only one stylesheet. The page never redirects automatically by `Accept-Language`. It sets `<html lang>`, `hreflang` alternates and a visible EN/DE switcher.
- Commands: `pnpm install`, `pnpm dev`, `pnpm build` (runs fetch-docs-export first, from M4), `pnpm preview`, `pnpm lint`, `pnpm check`, and `docker compose up` to preview the real nginx config. Node LTS is pinned in `.nvmrc` and `engines.node` (Node 26, LTS since 2026-10-28), pnpm in `packageManager` (pnpm 12). The application repo is still on Node 24 and pnpm 10; the two need not move together.
- Node 25 and later no longer ship Corepack. Locally, run `npm install --global corepack` once before `corepack enable`. CI uses `pnpm/action-setup` and isn't affected.
- pnpm 12 fails `pnpm install` when a dependency has a build script that isn't allowed (`ERR_PNPM_IGNORED_BUILDS`). In M2 no dependency has one, so there is no `allowBuilds` list and no `pnpm-workspace.yaml`. Astro 7 builds with Vite 8 and rolldown, so esbuild isn't in the tree, and sharp 0.35 installs prebuilt binaries without a script. Add a package to `allowBuilds` in `pnpm-workspace.yaml` only when an install fails this way.
- pnpm 12 also enforces a minimum release age by default. It rejected an Astro patch released the day before, and `pnpm add` then wrote an exclusion into `pnpm-workspace.yaml` by itself. Don't commit such exclusions; pick the previous version instead.
- TypeScript stays on 6.0.x: `typescript-eslint` supports `<6.1` and `@astrojs/check` supports `^6`, while TypeScript 7 is current.

## 6. Theme, assets, accessibility, privacy

- **Theme:** copy the two `@plugin 'daisyui/theme'` blocks verbatim into `src/styles/app.css`, with a header comment naming the source file and commit (`490d48d`). Copying keeps builds reproducible. `scripts/check-theme-drift.mjs` runs weekly and opens an issue if the upstream tokens change. The page follows the system theme only: no toggle and no storage.
- **Logos:** use SVG wherever possible. Each logo needs written permission or a published brand policy (de.NBI, ELIXIR-DE, NFDI4Biodiversity, NFDI4Microbiota, IPK, DFG). This is recorded in `ASSETS.md` with source URL, date and terms. Where a logo fails contrast on dark, ship a dark variant through `<picture><source media="(prefers-color-scheme: dark)">`.
- **Images:** screenshots go through `astro:assets` (sharp) as AVIF or WebP with fixed `width` and `height` and lazy loading. The light and dark screenshot pairs use the same `<picture>` media switch.
- **Badges:** download the OpenSSF badge SVGs at build time as static files. Hotlinking them would make a third-party request at runtime.
- **No third-party requests:** system fonts, no analytics, no CDN. A strict CSP is set in `nginx.conf`: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`. Astro's `build.inlineStylesheets: 'never'` keeps `style-src` strict. Further headers: HSTS (if the proxy doesn't set it), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
- **WCAG 2.2 AA:** the theme tokens are already AA-tuned for text (light). Contrast is checked in **both** themes and both locales in CI (§8). All logos have meaningful alt text ("de.NBI / ELIXIR-DE logo"), screenshots have descriptive alt text, and decorative icons have `aria-hidden`. Other requirements: a skip link, visible `:focus-visible` rings with daisyUI's focus colour, logical heading order (one `h1`), and target size of at least 24×24 px. External links in the same tab, with the destination clear from the link text.
- **Mobile:** the layout is checked at 320, 375, 768 and 1280 px. The nav collapses to a `<details>` menu, which needs no JavaScript.

## 7. SEO and sharing

For each locale the page sets a `<title>` and meta description, a canonical URL (`https://scorpion.bi.denbi.de/` and `/de/`), `hreflang` (en, de, x-default) and Open Graph and Twitter tags. The Open Graph image is a static 1200×630 PNG per locale, generated at build from an SVG template. Further: `@astrojs/sitemap` with i18n, `robots.txt`, and a schema.org `SoftwareApplication` JSON-LD block (name, licence ISC, `codeRepository`, `softwareVersion` from the docs export).

## 8. CI (GitHub Actions)

All actions are pinned by full SHA with a version comment. Workflows set `permissions: contents: read` at the top level, and only the jobs that need more get it (`packages: write`, `contents: write` for the events release, `id-token: write` for signing). Base images are pinned by digest. Dependabot covers `github-actions`, `npm` and `docker`, with grouped minor and patch updates and a 7-day cooldown (zizmor `dependabot-cooldown`).

| Workflow        | Trigger                                 | Steps                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`        | PR, push to `main`                      | prettier check, actionlint and zizmor on the workflows (from M1), eslint, `astro check`; validate `events/` and `src/data/` schemas; build; `html-validate` on `dist/`; lychee **offline** link check (internal links); Playwright + axe-core on `/` and `/de/` × light/dark × 375/1280 px; Docker build (no push) |
| `links.yml`     | daily schedule, PR touching `src/data/` | lychee **online** on the URL list, with instance and demo links as hard failures; opens or updates an issue on failure                                                                                                                                                                                             |
| `events.yml`    | push to `main` touching `events/`       | validate, build `events.json`, upload to the `events` release                                                                                                                                                                                                                                                      |
| `release.yml`   | push to `main`                          | build and push `ghcr.io/scorpion-monitoring/get-scorpion:{sha,latest}`; SBOM; keyless cosign signature and provenance attestation                                                                                                                                                                                  |
| `upstream.yml`  | weekly                                  | bump the docs-export PR; theme drift check                                                                                                                                                                                                                                                                         |
| `scorecard.yml` | weekly, push to `main`                  | OpenSSF Scorecard, SARIF upload                                                                                                                                                                                                                                                                                    |

Branch protection on `main` (a repository ruleset): pull request required with **0 required approvals**, because there is one maintainer, as in the application repo (CODEOWNERS still requests a review); the `ci.yml` checks green; linear history; no force pushes or deletion. Merges are squash-only, and branches are deleted after merge. Add `SECURITY.md`. Apply for the OpenSSF Best Practices badge for this repo too.

## 9. Deployment

- `docker/Dockerfile` is multi-stage: `node:<lts>-alpine@sha256:…` builds, then `nginxinc/nginx-unprivileged:<ver>-alpine@sha256:…` serves. The container runs as a non-root user on port 8080 with a read-only root filesystem and `/events/` as a volume. It has a `/healthz` endpoint.
- `nginx.conf` sets the headers from §6. Hashed assets get `Cache-Control: immutable` for a year, HTML and `/events/` get `no-cache`, and there is a custom 404. The container only serves `/`, `/de/` and assets. Routing `/denbi/` and `/nfdi/` stays with the reverse proxy.
- Rollout: the operator pulls the new tag (or Watchtower/Renovate on the host does). The exact step depends on the open point below.

## 10. Repository basics

`README.md` (purpose, run locally, deploy), `LICENSE` (**ISC**, matching the application, for code), `ASSETS.md` (logos and screenshots are not ISC; owners and terms listed; no separate `NOTICE`), `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, and `.editorconfig`. `CONTRIBUTING.md` has two short how-tos:

- **Add an event:** copy `events/_template.yaml`, fill in EN and DE, and open a PR. It is live about 15 minutes after merge.
- **Change a funder or instance logo:** add the SVG to `src/assets/logos/`, update `funders.yaml` or `instances.yaml`, record permission in `ASSETS.md`, and check contrast in dark mode.

## 11. Milestones (one PR each)

1. **Bootstrap:** git init, GitHub repo, licence and community files, branch protection, Dependabot, Prettier, and a minimal `ci.yml` (Prettier check; actionlint and zizmor on the workflows). ESLint arrives with the code in M2.
2. **Scaffold, theme and i18n:** the Astro project, copied themes, Paraglide with `/` and `/de/`, an empty `Landing` layout and the language switcher.
3. **Static sections:** nav, hero, get started, instances, funders and footer, with data files and logos (placeholder logos until permission is confirmed).
4. **Features and docs export:** the fetch script, `scorpion-release.json`, screenshots, feature cards, the version line and the badges.
5. **Events feed:** schema, template, `build-events.mjs`, client script and `events.yml`.
6. **Legal links and metadata:** IPK links, SEO, Open Graph images, sitemap and JSON-LD.
7. **Quality gates:** html-validate, axe/Playwright matrix, lychee jobs and Scorecard.
8. **Container and deployment:** Dockerfile, nginx config, `release.yml` and the host-side events timer, followed by the cutover from the old Astro site.

## 12. Risks and open points

1. **Who runs the reverse proxy, and how is `/` routed today?** This is needed for M8 and for choosing between the events timer and a sidecar. It also decides whether the HSTS and CSP headers come from the proxy or the container.
2. **User documentation does not exist yet** in the rebuild. The User Docs card needs a target: the app repo README, a future docs site, or hide the card until one exists. The old readthedocs is stale.
3. **The live instances seem to lag behind** (`/denbi/catalog/services` returns 404). Link the catalogue only after the rollout, or link to `/docs` only.
4. **Contact:** Discussions is off. Either enable Discussions on `scorpion-monitoring/scorpion`, or link to the new-issue chooser.
5. **IPK legal pages:** confirm that IPK's imprint and privacy policy cover this host, including nginx access logs and the GitHub-hosted events asset, which is fetched server-side. Get the EN and DE URLs.
6. **Logo permissions** for six organisations, plus SVG sources and dark variants.
7. **German copy** needs a native-speaker review. Feature wording needs your sign-off (§2).
8. **Screenshots** come from journey runs. Check that they show no real personal data, and that the ones chosen still exist after upstream renames (the build fails if they don't).
9. **Paraglide on Astro:** confirmed in M2. Paraglide JS 3 integrates cleanly through its Vite plugin, so the fallback (Astro i18n routing with typed JSON dictionaries) isn't needed. Details are in §5.
