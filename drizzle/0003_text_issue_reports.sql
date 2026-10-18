CREATE TABLE `text_issue_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`conversion_id` text NOT NULL,
	`app_version` text NOT NULL,
	`mode` text NOT NULL,
	`language` text NOT NULL,
	`category` text NOT NULL,
	`includes_text` integer NOT NULL,
	`original_text` text,
	`rewritten_text` text,
	`consent_version` text NOT NULL,
	`server_received_at` text NOT NULL,
	CONSTRAINT "text_issue_ids" CHECK(length("text_issue_reports"."report_id")=36 AND length("text_issue_reports"."conversion_id")=36),
	CONSTRAINT "text_issue_mode" CHECK("text_issue_reports"."mode" IN ('preset','ai')),
	CONSTRAINT "text_issue_language" CHECK("text_issue_reports"."language" IN ('ja','en')),
	CONSTRAINT "text_issue_category" CHECK("text_issue_reports"."category" IN ('grammar','meaning','low_changes','other')),
	CONSTRAINT "text_issue_text_consent" CHECK(("text_issue_reports"."includes_text"=0 AND "text_issue_reports"."original_text" IS NULL AND "text_issue_reports"."rewritten_text" IS NULL) OR ("text_issue_reports"."includes_text"=1 AND "text_issue_reports"."original_text" IS NOT NULL AND "text_issue_reports"."rewritten_text" IS NOT NULL AND length("text_issue_reports"."original_text")<=3000 AND length("text_issue_reports"."rewritten_text")<=3000 AND length("text_issue_reports"."original_text")+length("text_issue_reports"."rewritten_text")>0)),
	CONSTRAINT "text_issue_version" CHECK(length("text_issue_reports"."app_version") BETWEEN 1 AND 32 AND "text_issue_reports"."consent_version"='2026-10-18.2'),
	CONSTRAINT "text_issue_date" CHECK(length("text_issue_reports"."server_received_at")=24)
);
--> statement-breakpoint
CREATE INDEX `text_issue_received_idx` ON `text_issue_reports` (`server_received_at`);--> statement-breakpoint
CREATE INDEX `text_issue_conversion_idx` ON `text_issue_reports` (`conversion_id`);