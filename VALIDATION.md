# r24 export validation

Application source commit: `a78df255cc7f86880b7a717404aa581ae5d05094`.
Application version: `2026.10.18-r24`.
Date: 2026-10-18.

## Completed checks

- The r23 application checkout and its portable sync each passed 289 automated tests and TypeScript checking. The application passed the five-stage Vinext build. The r24 receipt-display follow-up passed 37 client tests, 43 independent checks, TypeScript checking and the same build; the only new behavior preserves a confirmed receipt when a sending choice is subsequently disabled.
- An independent fixed r23 copy passed 62 checks, including real local Workerd/D1 and additional cancellation, delayed-success, key-contamination and one-send UI event tests. The execution/storage boundary hashes matched the release.
- r22's conservative English dictionary safety fix passed 41 independent checks. Production dictionary examples confirmed that effort-adverb hard and think about are preserved while a supported adjectival hard phrase can be replaced.
- The new source sync is applied against the verified public r21 baseline. Application files are checked against the cited r23 commit; public documentation is adapted without copying deployment settings or data. All 289 r23 tests and portable typechecking were repeated successfully for the sync. The r24 client follow-up is checked separately.
- Tests include anonymous admission, shared request limits, separate text-report tables, execution-time selection, secret rejection, model-output validation and browser event-handler fixtures. Provider network requests are mocked or blocked.
- Live r23 browser and database verification confirmed one authorized synthetic source/result record with notice .5 and selection flag 1. The previous browser OFF settings were restored. No real Groq key is used in this export validation; the r24 follow-up publication is verified separately.
- The export excludes credentials, database records, private corpora, live Site identifiers and local runtime configuration. Previously published guide PNG assets and their C2PA provenance are unchanged.

## Environment and limits

Validation used Node.js 24.19.0, npm 11.9.0 and the pinned lockfile. The dependency package entries are unchanged from the previously installed and validated r10 export; this run reused the same installed dependency tree rather than doing a fresh network install. Other platforms and every supported Node version were not tested.

The portable build was run with `NODE_OPTIONS=--max-old-space-size=2048`. Automated tests are intentionally serial. A concurrent build in the application environment was killed under resource pressure; a separate build succeeded. Resource needs can differ on another machine.

There was no real Groq inference in these source-export tests. A mocked provider and local Worker tests do not establish universal production networking, semantic accuracy, security or third-party service behavior. The application export contains no runtime credentials, live Site identity, database, production environment settings or Git history.
