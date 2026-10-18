# Source publication checks

This export contains the r33 application source and portable setup files. It excludes live Site identity, Git history, runtime configuration, credentials, database contents, build output, caches and private evaluation corpora.

- Preserve MIT and third-party notices; the project license does not replace dependency or third-party UI/trademark terms.
- The three new dictionary tables listed in LICENSE-SCOPE.json use CC BY-SA 4.0; application software remains MIT. Preserve DATA-LICENSE.md and the original upstream notices, including their intentional whitespace.
- The public source contains clearly synthetic credential fixtures only. Pattern scans are a review aid, not proof that no secret can ever be present.
- Runtime recipient/key settings are not bundled. New deployments must configure their own data policy and operations.
- Use explicit non-personal author and committer identities when publishing Git commits. Repository source files do not control Git commit metadata.
- The published website and GitHub source are independently deployed; use the version and application commit in VALIDATION.md to compare them.
