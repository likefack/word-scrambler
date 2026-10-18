CREATE TABLE `contact_submissions` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`reply_email` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` text NOT NULL,
	`reply_requested` integer NOT NULL,
	`server_received_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "contact_id_length" CHECK(length("contact_submissions"."submission_id") = 36),
	CONSTRAINT "contact_email_length" CHECK("contact_submissions"."reply_email" IS NULL OR length("contact_submissions"."reply_email") BETWEEN 3 AND 254),
	CONSTRAINT "contact_subject_length" CHECK(length("contact_submissions"."subject") BETWEEN 1 AND 120),
	CONSTRAINT "contact_body_length" CHECK(length("contact_submissions"."body") BETWEEN 1 AND 4000),
	CONSTRAINT "contact_consent_version_length" CHECK(length("contact_submissions"."consent_version") BETWEEN 1 AND 32),
	CONSTRAINT "contact_date_lengths" CHECK(length("contact_submissions"."consented_at") = 24 AND length("contact_submissions"."server_received_at") = 24),
	CONSTRAINT "contact_reply_consent" CHECK(("contact_submissions"."reply_requested" = 0 AND "contact_submissions"."reply_email" IS NULL) OR ("contact_submissions"."reply_requested" = 1 AND "contact_submissions"."reply_email" IS NOT NULL)),
	CONSTRAINT "contact_status_values" CHECK("contact_submissions"."status" = 'pending')
);
--> statement-breakpoint
CREATE INDEX `contact_received_at_idx` ON `contact_submissions` (`server_received_at`);--> statement-breakpoint
CREATE INDEX `contact_status_received_idx` ON `contact_submissions` (`status`,`server_received_at`);