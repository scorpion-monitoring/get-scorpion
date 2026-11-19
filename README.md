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

_Filled in with M2 (scaffold)._

Prerequisites already fixed: Node.js from [.nvmrc](.nvmrc) and pnpm from `packageManager` in
[package.json](package.json) (`corepack enable` picks it up).

```sh
pnpm install
pnpm format:check
```

## Deploy

_Filled in with M8 (container and deployment)._

## Contributing, security and licence

- [CONTRIBUTING.md](CONTRIBUTING.md): workflow, adding an event, changing a logo.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.
- Code: [ISC](LICENSE). Logos and screenshots are **not** covered by the ISC licence; see
  [ASSETS.md](ASSETS.md).
