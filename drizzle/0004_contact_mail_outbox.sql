CREATE TABLE `contact_mail_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "contact_mail_nonce_length" CHECK(length("contact_mail_nonces"."nonce")=36)
);
--> statement-breakpoint
CREATE INDEX `contact_mail_nonce_expiry` ON `contact_mail_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `contact_mail_outbox` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`claim_id` text,
	`lease_until` integer,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`reason` text,
	FOREIGN KEY (`submission_id`) REFERENCES `contact_submissions`(`submission_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contact_mail_state" CHECK("contact_mail_outbox"."state" IN ('pending','claimed','sending','sent','unknown','blocked')),
	CONSTRAINT "contact_mail_claim_id" CHECK("contact_mail_outbox"."claim_id" IS NULL OR length("contact_mail_outbox"."claim_id")=36),
	CONSTRAINT "contact_mail_attempts" CHECK("contact_mail_outbox"."attempts">=0),
	CONSTRAINT "contact_mail_reason" CHECK("contact_mail_outbox"."reason" IS NULL OR "contact_mail_outbox"."reason" IN ('SEND_INTERRUPTED','SEND_UNCERTAIN','CONTENT_CHECK'))
);
--> statement-breakpoint
CREATE INDEX `contact_mail_ready` ON `contact_mail_outbox` (`state`,`next_attempt_at`);