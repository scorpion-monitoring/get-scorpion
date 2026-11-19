# Contributing

Thank you for helping with the Scorpion landing page. Issues and pull requests are welcome. Questions
about the application itself belong in the
[application repository](https://github.com/scorpion-monitoring/scorpion).

## Workflow

1. Branch from `main`. Use a short, descriptive branch name, for example `events/denbi-2027` or
   `fix/footer-links`.
2. Run `pnpm install` and `pnpm format` before you commit. Node.js comes from [.nvmrc](.nvmrc), pnpm
   from `packageManager` in [package.json](package.json).
3. Open a pull request against `main`. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) has to
   be green: formatting, `actionlint` and `zizmor` for the workflows, and the build checks that later
   milestones add.
4. Pull requests are squash-merged, and the branch is deleted after the merge. `main` takes no direct
   pushes and keeps a linear history.

Changes to workflows must follow the rules in [docs/plan.md](docs/plan.md) §8: `permissions:
contents: read` at the top level, every action pinned to a full commit SHA with a `# vX.Y.Z` comment,
`persist-credentials: false` on checkout, and no `pull_request_target`.

## How-tos

### Add an event

_Available from M5 (events feed)._

1. Copy `events/_template.yaml` to `events/<id>.yaml`, where `<id>` is short and unique (for example
   `denbi-plenary-2027`).
2. Fill in `start`, `end`, `location` and an `https://` `url`, and give `title` and `summary` in both
   English (`en`) and German (`de`).
3. Open a pull request. CI checks the file against `events/events.schema.json`.

The event is live about 15 minutes after the merge, with no rebuild or restart: CI publishes a new
`events.json`, and the host fetches it (docs/plan.md §4). Past events disappear by themselves.

### Change a funder or instance logo

_Available from M3 (static sections)._

1. Get written permission or check the organisation's published brand policy. Record the source URL,
   the terms and the date in [ASSETS.md](ASSETS.md). Logos without a recorded permission are not
   merged.
2. Add the logo as SVG to `src/assets/logos/`, plus a dark variant if the logo fails contrast on a dark
   background.
3. Update `src/data/funders.yaml` or `src/data/instances.yaml`, including meaningful alt text (for
   example "de.NBI / ELIXIR-DE logo").
4. Check the page in the light and the dark theme (`prefers-color-scheme`); the logo must stay
   legible in both.
