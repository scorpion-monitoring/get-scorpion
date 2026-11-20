# Third-party assets

The [ISC licence](LICENSE) covers the code of this repository only. **Logos and screenshots are not
covered by the ISC licence.** Logos remain the property of their owners and are used with their
permission or under their published brand policy. You may not reuse them under the ISC licence.

Every logo or other third-party asset needs a row here before it is merged (see
[CONTRIBUTING.md](CONTRIBUTING.md), "Change a funder or instance logo"). Record where it came from,
the terms or the permission, the date the permission was given or the policy was checked, and the
file in this repository.

| Asset                  | Owner                                                                         | Source URL | Licence or permission | Date | File |
| ---------------------- | ----------------------------------------------------------------------------- | ---------- | --------------------- | ---- | ---- |
| de.NBI logo            | de.NBI (German Network for Bioinformatics Infrastructure)                     | –          | permission pending    | –    | –    |
| ELIXIR-DE logo         | ELIXIR Germany                                                                | –          | permission pending    | –    | –    |
| NFDI4Biodiversity logo | NFDI4Biodiversity                                                             | –          | permission pending    | –    | –    |
| NFDI4Microbiota logo   | NFDI4Microbiota                                                               | –          | permission pending    | –    | –    |
| IPK logo               | Leibniz Institute of Plant Genetics and Crop Plant Research (IPK) Gatersleben | –          | permission pending    | –    | –    |
| DFG logo               | Deutsche Forschungsgemeinschaft (DFG)                                         | –          | permission pending    | –    | –    |

Until a row above has a recorded permission, the page shows a neutral placeholder for that logo (the
organisation name in a dashed box, with the same alt text). No organisation logo file is committed.

The following assets are in the repository. Scorpion's own logo comes with the application and is
under its ISC licence; the GitHub mark is used under GitHub's logo terms.

| Asset                                                           | Owner                                               | Source URL                                                                                                            | Licence or permission                                                                                                                                                                                                                                   | Date       | File                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Scorpion logo, light and dark (PNG; there is no SVG upstream)   | Scorpion maintainers (scorpion-monitoring/scorpion) | https://github.com/scorpion-monitoring/scorpion/tree/490d48da5c56cd99e2f23981f633daf2995887f7/apps/web/src/lib/assets | ISC, with the application (copyright 2026 feserm)                                                                                                                                                                                                       | 2026-11-20 | `src/assets/logos/scorpion-light.png`, `src/assets/logos/scorpion-dark.png` |
| GitHub mark (Invertocat)                                        | GitHub, Inc.                                        | https://brand.github.com/foundations/logo (`GitHub_Logos.zip`, `GitHub_Invertocat_Black.svg`)                         | GitHub logo terms: permitted as a link to a project on GitHub; shape unmodified; black, white or grey only (here the text colour, `#0f172a` light, `#e2e8f0` dark); less prominent than our own logo; must not suggest that GitHub endorses the project | 2026-11-20 | inlined in `src/components/GitHubMark.astro`                                |
| Icons: book-open, file-code, menu, message-circle, monitor-play | Lucide Icons and Contributors                       | https://lucide.dev (npm `lucide-static` 1.67.0)                                                                       | ISC                                                                                                                                                                                                                                                     | 2026-11-20 | inlined in `src/components/Icon.astro`                                      |

Screenshots of the Scorpion application are fetched at build time from the `docs-export.zip` of an
application release (docs/plan.md §3). They are not committed, and they are not covered by the ISC
licence.
