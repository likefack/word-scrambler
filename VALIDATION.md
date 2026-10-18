# r21 export validation

Application source commit: `d30cbdb0dd4648a54a6a2cbe3f93ae51a52728e7`.
Application version: `2026.10.18-r21`.
Date: 2026-10-18.

## Completed checks

- The application checkout passed 267 automated tests, TypeScript checking and the five-stage Vinext build.
- The preceding r20 portable export passed 266 tests, typechecking, local setup and the build. The r21 export changes only the diagnostic settings copy, application version and one display regression test. Its 28 client tests, typechecking, local setup and build were repeated successfully. The exact application files are checked against the r21 source commit.
- Tests include real local Workerd/D1 execution, anonymous admission, shared request limits, separate text-report tables, consent/secret rejection, model-output validation and browser event-handler fixtures. Provider network requests are mocked or blocked.
- An independent r21 copy review passed 32 client/preference tests and confirmed that consent, storage and POST conditions are unchanged.
- An independent r20 review passed 92 selected and additional checks. It found and corrected an over-broad privacy-text replacement before publication.
- The deployed r20 UI was checked in a cloud browser: attachment starts OFF, the parent setting controls availability, the current synthetic execution is previewed, consent starts OFF, edits are possible, and switching the parent OFF removes the unsent preview. No text attachment or real AI key was submitted in that check.
- The source export was scanned for credential patterns, personal email, private paths and live Site identifiers. Matches were limited to explicit synthetic test fixtures, reserved example addresses and generic dependency/template paths. PNG guide assets have no text or EXIF metadata fields; their C2PA provenance is retained.
- Application files match the cited commit. Portable setup, package name/scripts, licensing and public documentation are export-specific adaptations.

## Environment and limits

Validation used Node.js 24.19.0, npm 11.9.0 and the pinned lockfile. The dependency package entries are unchanged from the previously installed and validated r10 export; this run reused the same installed dependency tree rather than doing a fresh network install. Other platforms and every supported Node version were not tested.

The portable build was run with `NODE_OPTIONS=--max-old-space-size=2048`. Automated tests are intentionally serial. A concurrent build in the application environment was killed under resource pressure; a separate build succeeded. Resource needs can differ on another machine.

There was no real Groq inference in these source-export tests. A mocked provider and local Worker tests do not establish universal production networking, semantic accuracy, security or third-party service behavior. The application export contains no runtime credentials, live Site identity, database, production environment settings or Git history.
