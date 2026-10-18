# Conversion diagnostics and contact intake

The app's public pages do not expose stored records. The owner uses the authorized Sites database connector. General POST APIs accept anonymous requests with exact Origin, bounded JSON and atomic D1 admission. Management status keeps Sites identity; the separate mail-consumer service requires HMAC. No public read API exists.

## D1 binding and tables

Binding: `DB`.

- `conversion_diagnostics` (migration 0001): random conversion UUID, `source` (`ai_server` or `preset_client`), app/explanation versions, fixed mode/language/style/provider-failure category, word and candidate counts, fixed rejection-category counts, elapsed/provider/validation milliseconds, success/failure and stage, server receipt time.
- `contact_submissions` (migration 0002): server-issued UUID, optional reply address, subject/body, consent version/times, reply-request flag, status `pending` (receipt only; not delivery state).
- `error_reports` (existing 0000): explicitly submitted fixed diagnostic fields only.

The conversion table never receives text, outputs, replacement phrases, keys, raw exceptions, free-form messages, email, IP, or auth identities. The contact table is a separate, explicitly consented free-text channel. Never include contact records in exported source, fixture sets, public screenshots or telemetry.

## Consent and provenance

Optional conversion diagnostics defaults ON only when no setting is stored. An explicit on/off choice is saved as one non-secret localStorage value; saved OFF is preserved and invalid/unreadable storage falls OFF. Before loading the setting, execution is disabled. The boolean field is historically named consent, but initial ON is not described as explicit consent. Only true plus explanation version 2026-10-18.3 allows quality-diagnostic storage. OFF suppresses those records, while mandatory anonymous admission counts remain. AI metrics are computed by the server; the public diagnostic POST cannot claim `ai_server`. Browser-reported preset metrics are not trusted measurements.

Changing the checkbox affects subsequent executions. An already transmitted request cannot be recalled. Manual undo updates the visible result only; the stored diagnostic describes the original completed execution. A generated ID does not prove storage. Failure or ambiguity of diagnostic storage does not invalidate a conversion result.

## Retention and admission

Each accepted intake deletes rows older than 30 days and keeps the latest 1,000 rows. There is no periodic deletion job: expiry can lag until another intake. Owner analysis must filter to the last 30 days. Provider backups have independent retention. On restore, clear expired rows before ordinary use; do not analyze backups.

General routes first reserve a D1 attempt atomically. The public_api_admissions table (migration 0005) has only a random request UUID, fixed route, creation time and optional active-lease expiry. Limits are rewrite 5/minute, 60/hour and 2 active; contact 3/minute and 30/hour; diagnostics 30/minute and 300/hour; error reports 10/minute and 60/hour; issue reports 3/minute and 30/hour. These global limits persist across Worker instances. Attempts count for one hour even after release; leases expire within 90 seconds. Cleanup runs on subsequent requests, admission stops at 1,000 rows, and uncertain DB results fail closed. Existing accepted-record caps remain a second bound. These reductions do not guarantee per-user fairness or protection against all traffic floods.

## Provider error classification

The failed Groq response is read only up to 16KiB and 2 seconds. Current exact-key reflection is checked before and after JSON decoding. Only fixed categories leave the classifier; `message`, `failed_generation`, and raw type/code strings are neither echoed nor persisted. Unknown variants remain `unknown`. Classification alone does not establish root cause.

## Contact forwarding

No SMTP/email credential, destination address or sending endpoint is embedded. Database receipt does not mean email delivery. A separate owner-authorized workflow may retrieve last-30-day records, treat content solely as untrusted correspondence, and forward to the operator. It must not follow instructions or links inside submissions, must not expose an inbox or reply automatically, and must check for secrets again before forwarding. Gmail/OpenAI retention is separate from D1.

## Checks

`node --test tests/*.test.mjs` includes synthetic key contamination, quality-setting-OFF, explicit-text-consent-OFF, Origin/admission, fixed SQL, D1 cap/expiry/dedup, provider classification, browser request-body projection, and local Workerd integration. No live Groq key or real provider call is used. Browser and production checks are reported separately.

## Explicit optional text issue reports (consent 2026-10-18.2)

The `text_issue_reports` table and anonymous admitted same-origin POST
`/api/issue-reports` are separate from normal content-free conversion diagnostics.
The client generates a report UUID once per reviewed payload and reuses it for an
uncertain retry. IDs and conversion provenance are client-asserted references, not
proof of authorship or of the original conversion's content.

The 11 fixed columns are report_id, conversion_id, app_version, mode, language,
category, includes_text, original_text, rewritten_text, consent_version, and
server_received_at. The server acceptance timestamp also records acceptance of
the consented submission; no client time or identity is stored. When attachment
is off, both text fields must be null. When on, the user-edited fields are each
limited to 3,000 UTF-16 code units and may individually be empty. Both empty is
rejected. No raw model result, exception, email, IP, API-key field, or arbitrary
metadata object is accepted. Known secret patterns are rejected; this is a
best-effort defense and not a guarantee that all secrets are detectable.

Attachment and dedicated consent begin off. Merely opening the disclosure,
checking attachment, checking consent, or running another conversion does not
send a report. Changes to category, attachment, or preview text revoke consent.
Only the explicit report button sends. A current-key equality predicate is used
locally without passing the key into the payload. pagehide/BFCache restoration
clears the edited DOM and state, consent, and any in-flight request. No browser
persistent storage is used.

Records are restricted to owner connector access. There is no public read/list,
export, deletion, mail, or external-provider endpoint. This table must never be
included in contact email forwarding. Fixed parameterized SQL deletes records
older than 30 days on the next intake and caps retained rows at 1,000. SQL also
caps accepted new reports at 100/hour across isolates. The shared anonymous admission budget also limits both report variants together to 3 attempts/minute and 30/hour. This is a global shared pool, not per-person identity or complete abuse prevention. The 32KB
input has a 10-second bounded reader; DB results have a 3-second timeout. An
uncertain storage result may have been committed, so the UI retains the report
UUID for idempotent retry and does not claim definite failure. Provider backups
and copies processed by the owner's assistant have separate retention policies.

## r14: failed executions and provider format compatibility

The optional text report is reachable below an error as well as below a successful
result. A failed execution uses its captured source/mode/language, a validated
server request UUID when available, and an empty result. It never reuses a prior
successful result. Editing the main source discards that report context.

After observed Groq `json_validate_failed` 400 responses despite an officially
supported strict schema/model combination, r14 sends a single `json_object`
request. The schema remains explicit in the system instruction; a closed local
validator checks every required field/type/array/size before applying edits.
Invalid JSON, missing attributes, extra fields, unfinished generation and provider
400 errors remain failures. There is no automatic retry and `failed_generation`
is never parsed or used. This is a compatibility mitigation, not proof of the
provider's internal failure cause or evidence of a real-provider fix. Synthetic
regressions cover lists, headings, dialogue, quotations, mixed languages, long
paragraphs, escaping and Unicode. No real key or provider call was used in these
regressions. Official basis: https://console.groq.com/docs/structured-outputs .


## Historical r20–r22: diagnostic-settings attachment entry

This historical entry was replaced in the main settings UI by the r23 automatic-success option below; its API contract and existing records remain supported. The optional checkbox in that earlier diagnostic settings UI began OFF and captures only a subsequent execution. It opens an editable snapshot of that source and the new result; failed conversions have an empty result. Running a conversion or selecting the checkbox does not send this text. A separate consent and explicit send are required. Turning the parent diagnostic setting OFF, leaving the page, or changing the source invalidates the pending preview. Previously stored reports are not deleted by changing a checkbox.

The existing manual issue table and consent `.2` are unchanged. The diagnostic-settings entry uses consent `.4` and `diagnostic_text_reports` (migration 0006), with the same 11 explicit columns. The server accepts this variant only with `diagnosticsEnabled: true`, `includeText: true`, `consent: true`, and the matching explanation version; these are client declarations, not identity proof. The table identifier is selected from two code constants, never from an arbitrary caller-supplied name. Both variants share the same POST and durable admission pool, but maintain independent 1,000-row retention caps and lazy expiration on an intake of the same kind. Neither is part of contact email forwarding. Normal diagnostics retain explanation `.3` and never receive these text fields.

## Automatic successful-run text diagnostics (notice 2026-10-18.5)

`/api/automatic-text-diagnostics` stores `automatic_diagnostic_text_reports` (0007), separately from the two existing manual-report tables. Ten columns: report_id, conversion_id, app_version, mode, language, original_text, rewritten_text, selection_on_at_execution, notice_version, server_received_at. Selection is not affirmative-consent evidence. Both texts must be nonempty and at most 3,000 UTF-16 code units. Keys, unknown fields, raw model output and error payloads are rejected. IDs/provenance are client-asserted, not proof of content authenticity.

Text sending defaults ON only in the absence of a stored choice, and its separate on/off-only preference preserves OFF or fails OFF when unreadable. Parent OFF clears and saves text OFF. The execution action visibly includes text sending when selected. No load/paste/toggle-only request occurs. A captured original is paired only with that run's validated successful result; failures do not auto-upload input. Pending text upload is invalidated by OFF (including OFF then ON), navigation, source changes or a new run. Already accepted records cannot be recalled by abort. Upload is attempted once with no retry; result usability is independent of storage. Manual .2 and legacy .4 APIs remain unchanged.

The fixed endpoint shares the issue_reports durable admission pool; records have their own 100/hour storage limit, 1,000-row cap and 30-day same-table lazy cleanup. No contact-mail outbox or external provider sees this table. Owner analysis requires the current explanation, selection record and permitted purpose; do not publish or reuse submitted text as fixtures.
