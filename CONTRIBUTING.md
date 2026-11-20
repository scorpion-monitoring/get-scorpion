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
   be green: formatting, `actionlint` and `zizmor` for the workflows, and the `build` job (ESLint,
   `pnpm events:check`, the unit tests, `astro check` and the build, which downloads the pinned docs
   export), which later milestones extend.
4. Pull requests are squash-merged, and the branch is deleted after the merge. `main` takes no direct
   pushes and keeps a linear history.

Changes to workflows must follow the rules in [docs/plan.md](docs/plan.md) §8: `permissions:
contents: read` at the top level, every action pinned to a full commit SHA with a `# vX.Y.Z` comment,
`persist-credentials: false` on checkout, and no `pull_request_target`.

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
version line in the hero and the footer, and the feature screenshots (docs/plan.md §3). It does not
follow new releases by itself; until a scheduled workflow does this (planned for M7), bump it by hand
about once a week:

1. Run `pnpm bump-release` (or `pnpm bump-release v0.17.0` for a specific tag). It downloads the
   zip of the latest release, checks it like the build does, and writes the new `tag` and `sha256`.
2. Run `pnpm build` and look at the page in both themes: the screenshots may have changed. If a
   mapped screenshot was renamed or removed upstream, the build fails and names it; pick a new one
   (next how-to).
3. Open a pull request with `scorpion-release.json` (and `src/data/screenshots.yaml` if changed).

GitHub reports no digest for the asset, so the hash comes from the bump download. A build whose
download doesn't match the pinned hash fails; never "fix" that by editing the hash without finding
out why the asset changed.

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
