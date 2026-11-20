# Vendored Bioschemas profile schemas

`scripts/lib/bioschemas.mjs` checks our JSON-LD offline against these files (docs/plan.md §7). They
are copied unchanged, so don't reformat them (`.prettierignore` lists this directory). The page never
references them.

| File                                  | Profile                                                                                        | Source                                                                                                                                                                                                                              | Licence                                                                    | Copied     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| `ComputationalTool_v1.0-RELEASE.json` | [ComputationalTool 1.0-RELEASE](https://bioschemas.org/profiles/ComputationalTool/1.0-RELEASE) | https://github.com/BioSchemas/specifications/blob/35e6308e5483d098b029d6d721abac26f547257c/ComputationalTool/jsonld/ComputationalTool_v1.0-RELEASE.json (sha256 `8e532aa6fb09d745778b86981185255625d73ab223dd7d47619da884c8285f61`) | [CC-BY-SA-4.0](https://github.com/BioSchemas/specifications), © Bioschemas | 2026-11-20 |

The JSON schema in `$validation` lists the profile's Minimum properties as `required` apart from
`@context`, `@type`, `@id` and `dct:conformsTo`, which the profile page names as Minimum too; the
check adds those.
