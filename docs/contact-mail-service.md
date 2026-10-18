# Contact-only mail service (configuration required)

The server route `/api/contact-mail` accepts signed POST requests only. It reads
only `contact_submissions`; optional text issue reports and diagnostics are outside
this service. It never sends email itself. No key, owner address, service token,
activation operation, or browser UI is included.

`CONTACT_MAIL_HMAC_SECRET` is a server-only runtime secret. A matching secret in
an authorized private sender is a separate, user-controlled setup. An absent or
short secret rejects all requests. The schema adds only `contact_mail_outbox` and expiring `contact_mail_nonces`.
It contains no seed, activation UPDATE, trigger or historical backfill. Forwarding
requires `CONTACT_MAIL_ENABLED` to equal the exact string `true`, a configured HMAC
secret, and `CONTACT_MAIL_CUTOVER_AT` to be a valid ISO UTC timestamp. Missing or
invalid settings are disabled. When enabled, intake appends only the newly
accepted contact ID at/after cutover to the same D1 transaction. A failed enqueue
rolls back intake, and a rejected intake cannot create an outbox item.

Any future activation uses separately approved server runtime settings. Do not
activate through a data migration or add a public admin activation endpoint. Coordinate a future cutover time,
old-consumer boundary, and verified end-to-end delivery before stopping an
existing forwarding workflow. Never bulk enqueue or resend historical contacts.

Claims are atomic. Expired pre-send claims may be reclaimed. Once sending starts,
a stale or ambiguous send becomes `unknown`, which is never automatically retried.
A successful mail API call is acceptance, not proof of inbox delivery. ACK is
idempotent and bound to the original claim. Caller-supplied recipients or URLs are
not accepted. The private sender fixes its recipient outside this application.

The endpoint applies the existing 30-day delayed contact cleanup when claiming.
Deletion cascades to the outbox; previously delivered email is a separate copy.
Known secret patterns and the exact configured HMAC value are blocked before a
contact is returned. This is best-effort detection, not a guarantee that free text
cannot contain a secret. Authentication credentials and raw failure details are not included in diagnostic
responses or application logs; claimed correspondence may still contain
undetected secrets.

Local tests use synthetic credentials, an isolated Workerd runtime and D1. They do
not verify published Dispatch transport, any real credential, scheduled execution,
OAuth permission, mail quota or inbox delivery. Public Sites may allow anonymous
HTTP transport, but this route still requires valid HMAC authority. A broader
Sites service token must not be assumed necessary until real transport is checked.
