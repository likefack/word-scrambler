# Third-party notices

## Scope

The root MIT license applies to this project's original work. It does not replace the license, attribution, patent, source-availability or redistribution terms attached to third-party code, fonts, icons or data. This review archive contains source, not `node_modules`, package tarballs, built JavaScript, native binaries or a container image.

## Notices retained in this source tree

- `build/sites-vite-plugin.ts`: vendored from `@openai/sites-vite-plugin` 0.2.0; the upstream MIT notice, Copyright (c) 2026 OpenAI, is preserved in `build/sites-vite-plugin.LICENSE`.
- `vendor/shadcn-tailwind-4.13.0.css`: upstream MIT notice, Copyright (c) 2023 shadcn, is preserved in `vendor/shadcn-tailwind-4.13.0.LICENSE.md`. The same notice also records the shadcn attribution for derived UI components in `components/ui/` (the existing ESLint configuration identifies those registry sources as shadcn 4.17.0); retain it when copying those components.
- Lucide icons are imported through `lucide-react` (ISC according to the pinned package metadata). Any distributed bundle must retain required dependency notices.
- Next.js starter artwork retained in `public/file.svg`, `public/globe.svg` and `public/window.svg`: the Next.js MIT license is retained in `vendor/next-starter.LICENSE.md`.
- Other template support files are retained with their existing comments. No blanket claim is made here that all template provenance has received a separate legal audit.

## Dependency inventory

`DEPENDENCY_LICENSES.json` lists every non-root package entry in the pinned lockfile, including transitive and optional platform packages. Versions and license expressions were read from that lockfile; this is not an independent legal determination. Packages sharing a name can appear at multiple nested locations.

The earlier direct-only inventory is superseded by this lockfile-based inventory. The lockfile contains 891 package entries. License expressions and counts:

- `0BSD`: 2
- `Apache-2.0`: 45
- `Apache-2.0 AND LGPL-3.0-or-later`: 3
- `Apache-2.0 AND LGPL-3.0-or-later AND MIT`: 1
- `BSD-2-Clause`: 11
- `BSD-3-Clause`: 6
- `BlueOak-1.0.0`: 1
- `CC-BY-4.0`: 1
- `CC0-1.0`: 2
- `ISC`: 33
- `LGPL-3.0-or-later`: 10
- `MIT`: 742
- `MIT AND ISC`: 1
- `MIT OR Apache-2.0`: 4
- `MPL-2.0`: 28
- `Python-2.0`: 1

Before distributing built assets, native dependencies, an image or an executable, inspect the actual included packages and their license/NOTICE files. In particular, LGPL-bearing libvips/sharp-related packages, MPL packages, Apache packages and attribution-bearing data can carry obligations beyond the root MIT text. Not every optional platform package is installed or shipped, and this list does not establish which packages are present in a production bundle. Do not remove notices from dependencies.

## Dictionary / NLP data

This source snapshot contains project-maintained lexical alternatives, not a redistributed WordNet database or extracted WordNet dataset. Work on dictionary/NLP expansion is ongoing elsewhere. If those changes are incorporated, add the exact data source, upstream version, modification/extraction description and complete required notices before publishing. Re-run the inventory and source scan against the final snapshot.

## Guide illustrations added after r10

`public/guide/` contains instructional Groq-interface screenshots with annotations and explicitly labeled schematic illustrations. Groq interface elements and trademarks remain their respective owners' material; the project's MIT license does not grant separate rights in third-party trademarks or interfaces. The guide distinguishes cropped/annotated screenshots from explanatory diagrams. No real API key or private account row is included in the reviewed assets. The project-maintained UI, arrows, annotations and explanatory text do not imply affiliation with Groq.

The dependency lock entries are unchanged from the previously inventoried r10 export. No WordNet, Sudachi dictionary, spaCy model or Python NLP dataset was added to this r21 source export.
