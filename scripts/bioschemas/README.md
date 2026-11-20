# Vendored Bioschemas profile schemas

`scripts/lib/bioschemas.mjs` checks our JSON-LD offline against these files (docs/plan.md §7). They
are copied unchanged, so don't reformat them (`.prettierignore` lists this directory). The page never
references them.

| File                                  | Profile                                                                                        | Source                                                                                                                                                                                                                              | Licence                                                                    | Copied     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| `ComputationalTool_v1.0-RELEASE.json` | [ComputationalTool 1.0-RELEASE](https://bioschemas.org/profiles/ComputationalTool/1.0-RELEASE) | https://github.com/BioSchemas/specifications/blob/35e6308e5483d098b029d6d721abac26f547257c/ComputationalTool/jsonld/ComputationalTool_v1.0-RELEASE.json (sha256 `8e532aa6fb09d745778b86981185255625d73ab223dd7d47619da884c8285f61`) | [CC-BY-SA-4.0](https://github.com/BioSchemas/specifications), © Bioschemas | 2026-11-20 |
| `Event_v0.3-DRAFT.json`               | [Event 0.3-DRAFT](https://bioschemas.org/profiles/Event/0.3-DRAFT)                             | https://github.com/BioSchemas/specifications/blob/6c8116ef464f2f99f48c8267ae16e7d8eb2b0d78/Event/jsonld/Event_v0.3-DRAFT.json (sha256 `4556cd66334ead6aa826e78022b3fb0898301de062306d520e995e26a68f2d40`)                           | [CC-BY-SA-4.0](https://github.com/BioSchemas/specifications), © Bioschemas | 2026-11-20 |
| `Course_v1.0-RELEASE.json`            | [Course 1.0-RELEASE](https://bioschemas.org/profiles/Course/1.0-RELEASE)                       | https://github.com/BioSchemas/specifications/blob/6c8116ef464f2f99f48c8267ae16e7d8eb2b0d78/Course/jsonld/Course_v1.0-RELEASE.json (sha256 `75876566905f31bc3e252b1188af8990806eead2ab6dee98835c2b48ec6ee04e`)                       | [CC-BY-SA-4.0](https://github.com/BioSchemas/specifications), © Bioschemas | 2026-11-20 |
| `CourseInstance_v1.0-RELEASE.json`    | [CourseInstance 1.0-RELEASE](https://bioschemas.org/profiles/CourseInstance/1.0-RELEASE)       | https://github.com/BioSchemas/specifications/blob/6c8116ef464f2f99f48c8267ae16e7d8eb2b0d78/CourseInstance/jsonld/CourseInstance_v1.0-RELEASE.json (sha256 `54da2aff973bf91c132e5373284a16f44efa71849bf3baa799f91b7d9f9dd3a4`)       | [CC-BY-SA-4.0](https://github.com/BioSchemas/specifications), © Bioschemas | 2026-11-20 |

The JSON schema in `$validation` lists the profile's Minimum properties as `required` apart from
`@context`, `@type`, `@id` and `dct:conformsTo`, which the profile page names as Minimum too; the
check adds those.

The event profiles (M6b) are checked by `scripts/lib/event-profiles.mjs`. Event 0.3-DRAFT is the only
version of that profile; its `eventType` vocabulary (workshops and courses, meetings and conferences,
receptions and networking, awards and prizegivings) is listed on the 0.1-DRAFT and 0.2-DRAFT pages
only.

The generated schemas have two quirks that `loadProfile()` works around, so the check accepts what
the profile pages allow and nothing more:

- **`oneOf` is read as `anyOf`.** The object definitions (`place`, `postaladdress`, `organization`,
  ...) don't constrain `@type` and require nothing, so any object matches several of them, and
  `oneOf` would reject every structured value, for example a Place as `location`.
- **The `date` format accepts an ISO 8601 date or date-time.** `startDate` and `endDate` are
  "a string with format `date`, or the `datetime` definition", which is an object, so a date-time
  string such as `2027-03-10T09:00:00+01:00` (schema.org DateTime) could match nothing otherwise.
