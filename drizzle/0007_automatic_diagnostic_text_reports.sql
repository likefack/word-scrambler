CREATE TABLE `automatic_diagnostic_text_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`conversion_id` text NOT NULL,
	`app_version` text NOT NULL,
	`mode` text NOT NULL,
	`language` text NOT NULL,
	`original_text` text NOT NULL,
	`rewritten_text` text NOT NULL,
	`selection_on_at_execution` integer NOT NULL,
	`notice_version` text NOT NULL,
	`server_received_at` text NOT NULL,
	CONSTRAINT "automatic_text_ids" CHECK(length("automatic_diagnostic_text_reports"."report_id")=36 AND length("automatic_diagnostic_text_reports"."conversion_id")=36),
	CONSTRAINT "automatic_text_mode" CHECK("automatic_diagnostic_text_reports"."mode" IN ('preset','ai')),
	CONSTRAINT "automatic_text_language" CHECK("automatic_diagnostic_text_reports"."language" IN ('ja','en')),
	CONSTRAINT "automatic_text_content" CHECK(length("automatic_diagnostic_text_reports"."original_text") BETWEEN 1 AND 3000 AND length("automatic_diagnostic_text_reports"."rewritten_text") BETWEEN 1 AND 3000),
	CONSTRAINT "automatic_text_selected" CHECK("automatic_diagnostic_text_reports"."selection_on_at_execution"=1),
	CONSTRAINT "automatic_text_notice" CHECK("automatic_diagnostic_text_reports"."notice_version"='2026-10-18.5' AND length("automatic_diagnostic_text_reports"."app_version") BETWEEN 1 AND 32),
	CONSTRAINT "automatic_text_received" CHECK(length("automatic_diagnostic_text_reports"."server_received_at")=24)
);
--> statement-breakpoint
CREATE INDEX `automatic_text_received_idx` ON `automatic_diagnostic_text_reports` (`server_received_at`);--> statement-breakpoint
CREATE INDEX `automatic_text_conversion_idx` ON `automatic_diagnostic_text_reports` (`conversion_id`);