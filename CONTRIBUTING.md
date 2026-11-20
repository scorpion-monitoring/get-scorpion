# Contributing

Thank you for helping with the Scorpion landing page. Issues and pull requests are welcome. Questions
about the application itself belong in the
[application repository](https://github.com/scorpion-monitoring/scorpion).

## Workflow

1. Branch from `main`. Use a short, descriptive branch name, for example `events/denbi-2027` or
   `fix/footer-links`.
2. Run `pnpm install`, then `pnpm format`, `pnpm lint` and `pnpm check` before you commit. Node.js comes from [.nvmrc](.nvmrc), pnpm
   from `packageManager` in [package.json](package.json).
3. Open a pull request against `main`. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) has to
   be green: formatting, `actionlint` and `zizmor` for the workflows, the `build` job (ESLint,
   `pnpm events:check`, the unit tests, `astro check`, the build, which downloads the pinned docs
   export, then html-validate and the offline link check on `dist/`) and the `browser` job
   (accessibility and the other browser checks). See
   [Run the quality checks locally](#run-the-quality-checks-locally).
4. Pull requests are squash-merged, and the branch is deleted after the merge. `main` takes no direct
   pushes and keeps a linear history.

Changes to workflows must follow the rules in [docs/plan.md](docs/plan.md) §8: `permissions:
contents: read` at the top level, every action pinned to a full commit SHA with a `# vX.Y.Z` comment
(and at least 7 days old), tool binaries pinned by version and sha256, `persist-credentials: false`
on checkout, `timeout-minutes` and `concurrency` everywhere, and no `pull_request_target`.

## Run the quality checks locally

Each check is a `pnpm` script, and CI runs the same command. All but the theme check need a built
site, so run `pnpm build` first.

- `pnpm check:html`: [html-validate](https://html-validate.org/) on every page in `dist/`, with the
  rules in [.htmlvalidate.mjs](.htmlvalidate.mjs). The only allowed findings are listed, each with
  its reason, in [scripts/check-html.mjs](scripts/check-html.mjs); one that no longer occurs fails
  too, so remove it then.
- `pnpm check:browser`: Playwright and axe-core in Chromium
  ([scripts/check-browser.mjs](scripts/check-browser.mjs)). Install the browser once with
  `pnpm exec playwright-core install --with-deps --only-shell chromium` (`--with-deps` installs the
  system packages and asks for sudo; leave it out if you have them). The script serves `dist/` with
  the page's CSP and checks `/` and `/de/` in the light and the dark theme at 375 and 1280 px, with
  the empty events feed and with one built from `scripts/fixtures/events/`: the WCAG 2.2 A and AA
  rules of axe, one `h1`, the skip link, no horizontal scrolling, the mobile menu, no request to
  another origin, no console error or CSP violation, and the events section. A failure lists every
  problem of that run, for example `axe color-contrast (serious): … 1 element(s): .hero p`. "axe
  needs review" lines are elements axe can't decide (docs/plan.md §6); they don't fail the run, but
  check them by hand when they change.
- `pnpm check:links`: [lychee](https://lychee.cli.rs/) **offline** on `dist/`: internal links and
  `#fragments` only. Install lychee from your package manager or its
  [releases](https://github.com/lycheeverse/lychee/releases) (CI uses the version in
  [ci.yml](.github/workflows/ci.yml)).
- `pnpm check:links:online`: lychee on the external links in `src/data/*.yaml`, as the
  [Links workflow](.github/workflows/links.yml) does daily. Needs network; see
  [Link check failures](#link-check-failures).
- `pnpm check:theme-drift`: compares the daisyUI themes with the application's latest release (see
  [Theme drift](#theme-drift)). Needs network.

## Texts and translations

All visible text lives in [messages/](messages/): `messages/en.json` for English and
`messages/de.json` for German. Both files must have the **same keys**. Paraglide itself would fall
back to English for a key missing in `de.json` without an error, so `pnpm check` first runs
[scripts/check-messages.mjs](scripts/check-messages.mjs), which fails when the key sets differ. The
data files in `src/data/` hold message keys rather than text (apart from organisation names); an
unknown key there fails `pnpm check`.
Message keys use `snake_case`, and a placeholder looks like `{name}`.

[Paraglide JS](https://paraglidejs.com) compiles the files into typed functions in `src/paraglide/`
at build time; that directory is generated and not committed. In a component, call a message with
the page locale, for example `m.hero_title({}, { locale })`. A misspelled key fails `pnpm check`.
German copy gets a native-speaker review before release (docs/plan.md §12.7).

## How-tos

### Add an event

1. Copy [events/\_template.yaml](events/_template.yaml) to `events/<id>.yaml`. `<id>` is short and
   unique, in lowercase letters, digits and single hyphens (for example `denbi-ahm-2027`), and
   the `id` field must be the same as the file name.
2. Fill it in; the comments in the template explain every field. All event types need:
   - `type`: `training`, `hackathon`, `workshop`, `meeting` or `conference`. The page shows it as a
     label, and it decides the Bioschemas markup for TeSS (docs/plan.md §4).
   - `start` and `end`: both dates (`2027-03-10`, all-day, `end` is the last day) or both date-times
     with an offset (`2027-03-10T09:00:00+01:00`).
   - `title` and `summary` in English (`en`) and German (`de`), and `location` as the page shows it
     (a city, or "Online").
   - `host`: the hosting organisation's `name`, optionally its `url` and `ror` id.
   - `contact`: a `name` and an `email` or a `url` (or both), shown on the page. Prefer an office or
     function address to a person's.
3. Depending on the type and the event:

   | Field          | `training`                              | `hackathon`, `workshop`, `meeting`, `conference` |
   | -------------- | --------------------------------------- | ------------------------------------------------ |
   | `mode`         | required: `online`, `onsite`, `blended` | not allowed                                      |
   | `keywords`     | required, 1 to 10, English              | optional (a hackathon gets `hackathon` added)    |
   | `url`          | optional                                | optional                                         |
   | `registration` | optional, https                         | optional, https                                  |
   | `address`      | optional                                | optional                                         |
   | `capacity`     | optional                                | optional                                         |
   | `language`     | optional, default `en`                  | optional, default `en`                           |
   | `tess`         | optional, default `true`                | optional, default `true`                         |
   - **No page of its own?** Leave out `url`. The event's link is then its entry on the landing
     page, `https://scorpion.bi.denbi.de/#event-<id>`, which opens the right page of the list and
     jumps to the event; TeSS links there too. Give a `registration` link and a `contact`, so
     visitors can act on it.
   - **Already in TeSS?** If TeSS lists the event from another source (for example the organiser's
     own page in de.NBI's TeSS entries), set `tess: false`, so it isn't listed twice. It still
     shows on the landing page.
   - `address` (`locality` and `country` required, `country` as an ISO code such as `DE`; quote the
     postal code) helps TeSS place the event on its map.

4. Run `pnpm events:check`. It names the file and the field of every problem. `pnpm events:build`
   also writes the resulting `events.json` and `events.jsonld` to the git-ignored `.cache/events/`,
   so you can see what would be published.
5. Open a pull request. CI runs the same check.

After the merge, [.github/workflows/events.yml](.github/workflows/events.yml) publishes a new
`events.json` and `events.jsonld` as the assets of the rolling `events` pre-release within a few
minutes. It also runs daily to drop past events, and can be started by hand (`workflow_dispatch`).
TeSS reads `events.jsonld` at its next harvest (see the next how-to). **Once M8 is deployed**, the
host fetches both assets every 15 minutes, so the event is live on the page about 15 minutes after
the merge, with no rebuild or restart (docs/plan.md §4). Until then, the event is published to the
release but not served: the page only shows the empty fallback in `public/events/events.json`.

Past events disappear by themselves: the page drops an event once its `end` has passed (the end of
that day in Europe/Berlin for a date). The section shows five events per page, and stays hidden when
there is none. To remove an event earlier, delete its file in a pull request.

**Changing the format:** the page rejects events with fields it doesn't know, so a new field is only
ever added as optional, and no event file uses it until the page that knows it is deployed. Any
other change needs a new `schemaVersion` (docs/plan.md §4).

### Register the TeSS source

[ELIXIR TeSS](https://tess.elixir-europe.org/) harvests our upcoming events from `events.jsonld`
(Bioschemas JSON-LD, docs/plan.md §4). Registering the source is a one-time, manual step in TeSS;
TeSS administrators approve it.

1. Sign in to TeSS (ELIXIR AAI) and create a **content provider** (Content providers → Register
   content provider):
   - **Title:** `Scorpion`
   - **URL:** `https://scorpion.bi.denbi.de/`
   - **Contact:** the maintainers' contact address
   - **Description:** for example "Scorpion is the KPI monitoring software of de.NBI / ELIXIR-DE and
     the NFDI consortia. This provider lists training, hackathons and other events about Scorpion."
   - **Type:** `Project`
   - **Receive content curation emails at this address:** the maintainers' address
   - **ELIXIR node:** `Germany`
   - **Keywords:** `Scorpion`, `KPI monitoring`, `research infrastructure`
   - Image: the Scorpion logo, if you want one.
2. On the provider's page, open **Sources** → **Add source**:
   - **URL:** `https://github.com/scorpion-monitoring/get-scorpion/releases/download/events/events.jsonld`
   - **Ingestion Method:** `Bioschemas`
   - **Authentication Token:** empty
   - **Default language:** English
   - **Enabled:** yes
   - **Approval status:** request approval
3. Use **Test** on the source: it shows what TeSS extracts without saving anything. With the current
   events (all `tess: false`) it finds nothing, which is expected; it must not report a parsing
   error.
4. Wait for the approval. TeSS harvests approved sources about once a day; check the provider's
   events after the first harvest and the log on the source's page.

TeSS matches an event to an earlier harvest by its `url` (within this content provider), so keep an
event's `id` and `url` stable once it is published. A `training` arrives as "Workshops and courses";
other types arrive without a TeSS event type, because TeSS doesn't read `eventType` (docs/plan.md
§12.11). Curators can set it in TeSS.

**At M8:** once `https://scorpion.bi.denbi.de/events/events.jsonld` serves the file (the host timer
fetches it from the release), you may change the source URL to it. TeSS then needs to approve the
source again. Event URLs don't change, so TeSS keeps the same events. Keeping the release URL is
fine too; it doesn't depend on the host timer.

### Bump the Scorpion release

`scorpion-release.json` pins the application release whose `docs-export.zip` the build uses: the
version line in the hero and the footer, and the feature screenshots (docs/plan.md §3). Every Monday,
job `bump` of [.github/workflows/upstream.yml](.github/workflows/upstream.yml) runs
`pnpm bump-release`, and if there is a newer release, opens a pull request
`deps: bump the Scorpion release to vX.Y.Z` from the branch `bot/scorpion-release`, or updates the
one that is open. CI runs on it like on any other pull request. To review it:

1. Check out the branch, run `pnpm build` and look at the page in both themes: the screenshots may
   have changed. If a mapped screenshot was renamed or removed upstream, CI's build fails and names
   it; pick a new one (next how-to) and push the fix to the same branch.
2. Merge it when CI is green. If you leave it open, the next run adds a commit for the next release
   on top. If you close it without merging, the next run starts again from `main`.

To bump by hand (or between runs; the workflow also has a "Run workflow" button):

1. Run `pnpm bump-release` (or `pnpm bump-release v0.17.0` for a specific tag). It downloads the
   zip of the latest release, checks it like the build does, and writes the new `tag` and `sha256`.
2. Run `pnpm build` and look at the page in both themes, as above.
3. Open a pull request with `scorpion-release.json` (and `src/data/screenshots.yaml` if changed).

GitHub reports no digest for the asset, so the hash comes from the bump download. A build whose
download doesn't match the pinned hash fails; never "fix" that by editing the hash without finding
out why the asset changed.

### Link check failures

lychee prints one line per broken link, grouped by the file it is in, for example:

```text
[src/data/links.yaml]:
[404] https://www.ipk-gatersleben.de/en/imprint (at 42:9) | Rejected status code: 404 Not Found
[TIMEOUT] https://test.scorpion.bi.denbi.de/ (at 21:8) | Timeout
```

The first field is the HTTP status or the error (`TIMEOUT`, `ERROR` for DNS or TLS), then the URL,
the line and column in the file, and lychee's reason. In CI it is in the job log and the run's
summary. A scheduled failure of the [Links workflow](.github/workflows/links.yml) opens the issue
"Scheduled link check failed", or comments on it if it is open; close it once the run is green
again.

- **An instance link or the demo** (`/denbi/`, `/nfdi/`, `/denbi/docs`,
  `https://test.scorpion.bi.denbi.de/`) is down: that is the point of the check. Tell the operators;
  don't exclude the link.
- **A page moved** (404, or a redirect to a different page): update the URL in `src/data/`.
- **One failure that is fine on the next run** (a timeout, a 5xx): rerun the workflow
  ("Re-run jobs"). If it keeps happening for one host, look at it before you change anything.
- **A host blocks bots or rate-limits** (403 or 429 in CI, but the page opens in a browser): add a
  narrow, commented entry for that host to [lychee.toml](lychee.toml), with the date and the status
  it returned. ror.org is handled that way (its ids are checked through the ROR API). Never accept
  an error status for every host.
- **The offline check** (`pnpm check:links` in CI's `build` job) reports a missing file or
  `Cannot find fragment`: an internal link or an `id` changed; fix the link in the component.

### Theme drift

The page's two daisyUI themes in `src/styles/app.css` are copied from the application repo
(docs/plan.md §6). Every Monday, job `theme-drift` of
[.github/workflows/upstream.yml](.github/workflows/upstream.yml) compares them with
`apps/web/src/app.css` at the application's latest release. When they differ, it opens the issue
"Theme drift from the application repo" (or comments on the open one) with a table of every token
that changed. To resolve it:

1. Copy the theme list and both `@plugin 'daisyui/theme'` blocks from the release named in the
   issue into `src/styles/app.css`, verbatim, and update the commit in the header comment.
2. Run `pnpm check:theme-drift` (it should pass now), `pnpm build` and `pnpm check:browser`: the
   contrast checks run in both themes. Look at the page in both themes too.
3. Open a pull request, and close the issue when it is merged.

If the application changed a theme on purpose and the page should not follow, say so in the issue
and close it; it is reopened (as a new issue) on the next run while the difference remains, so a
lasting decision belongs in docs/plan.md §6.

### The upstream bot (maintainers)

The bump pull request is opened with a GitHub App token, because a pull request opened with the
workflow's own `GITHUB_TOKEN` doesn't start CI (docs/plan.md §3). Set it up once:

1. Create a GitHub App in the `scorpion-monitoring` organisation (Settings → Developer settings →
   GitHub Apps), for example "get-scorpion upstream bot": no webhook, no callback URL, repository
   permissions **Contents: Read and write** and **Pull requests: Read and write** (Metadata: read is
   added by itself), nothing else, installable only on this account.
2. Install it on **only** the `get-scorpion` repository.
3. Note its **Client ID** and generate a **private key**. Add both as repository secrets
   (Settings → Secrets and variables → Actions): `RELEASE_BUMP_APP_CLIENT_ID` and
   `RELEASE_BUMP_APP_PRIVATE_KEY` (the whole `.pem` file).
4. Run the Upstream workflow by hand ("Run workflow") and check that job `bump` either finds nothing
   to do or opens the pull request, and that CI starts on it.

The workflow asks for a token with only those two permissions, for this repository only. To rotate
the key, generate a new one, replace the secret and delete the old key in the App's settings.

### Change a feature card's screenshot

1. Download `docs-export.zip` of the pinned release, or look in `src/assets/generated/` after a build
   for the pairs in use. `screenshots.json` in the zip lists every pair as `journey`, `slug`,
   `light` and `dark`. Slugs are only unique within a journey, so always give both.
2. Look at the light **and** the dark image. They must show test data only, no real names, email
   addresses or other personal data (docs/plan.md §12.8).
3. In `src/data/screenshots.yaml`, set `journey` and `slug` under the card id, and update the alt
   text named by `alt` in `messages/en.json` and `messages/de.json` so it describes what the new
   screenshot shows. Removing a card's entry shows its icon instead.
4. Run `pnpm build`. It fails if the pair isn't in the pinned docs export.

### Change the meta texts or the Open Graph image

- **Title and description:** `page_title`, `meta_description`, `og_title` and `og_description` in
  `messages/en.json` and `messages/de.json`. Keep a description to about 150 characters, and claim nothing the page
  doesn't say. No Twitter/X tags; link previews use Open Graph.
- **Open Graph image:** it shows the hero title (`hero_title`) of each locale. After changing that
  text, the logo or [scripts/og-images.mjs](scripts/og-images.mjs) (layout, colours), run
  `pnpm og-images`, look at `public/og/en.png` and `public/og/de.png`, and commit them together with
  `scripts/og-images.json`. `pnpm test` fails while they are stale. Update `og_image_alt` if the
  image text changes. The favicons come from the same script.
- Link previews can only be checked once the page is live (after the M8 cutover), for example with
  LinkedIn's Post Inspector.

### Change the structured data (Bioschemas)

The event markup (`events.jsonld`) is built from the event files; see "Add an event" and
docs/plan.md §4. This how-to is about the page's own markup.

The landing page carries Bioschemas
[ComputationalTool 1.0-RELEASE](https://bioschemas.org/profiles/ComputationalTool/1.0-RELEASE)
markup as JSON-LD (docs/plan.md §7).

1. Edit [src/data/software.yaml](src/data/software.yaml): category, EDAM topics and operations (look
   the ids up in [EDAM](https://edamontology.org/) and use the preferred label as `name`), keywords,
   authors, providers, funders and citations. Organisations are ids in `funders.yaml` (add a `ror`
   there); links are ids in `links.yaml`. The description is the hero text; the version is the pinned
   release.
2. Run `pnpm check` (schema of the data file), `pnpm test` (builds the markup for both locales and
   checks it offline against the profile) and `pnpm build` (checks the built pages).
3. After the deploy, check the live page with the Bioschemas validator or Google's Rich Results Test.

### Change the imprint or privacy links

The imprint and the privacy policy are IPK's: `imprint` and `privacy` in
[src/data/links.yaml](src/data/links.yaml), each with one URL per locale (`urls.en`, `urls.de`, both
required, https only). The standard IPK privacy policy applies to this site, so there is no page of
our own.

### Change a funder or instance logo

Until a logo is added, the page shows a placeholder: the organisation name in a dashed box, at the
logo's size and with its alt text.

1. Get written permission or check the organisation's published brand policy. Record the source URL,
   the terms and the date in [ASSETS.md](ASSETS.md). Logos without a recorded permission are not
   merged.
2. Add the logo as SVG to `src/assets/logos/`, plus a dark variant if the logo fails contrast on a dark
   background.
3. In `src/data/funders.yaml` or `src/data/instances.yaml`, set `logo.src` (and `logo.dark`) to the
   file, relative to the YAML file, for example `src: ../assets/logos/dfg.svg`. `logo.width` and
   `logo.height` are the box the logo is fitted into. The alt text is the message named by
   `logo.alt` (for example "de.NBI / ELIXIR-DE logo") in both message files.
4. Check the page in the light and the dark theme (`prefers-color-scheme`); the logo must stay
   legible in both.
