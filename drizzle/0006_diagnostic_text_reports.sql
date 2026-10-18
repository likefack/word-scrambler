CREATE TABLE `diagnostic_text_reports` (
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
	CONSTRAINT "diagnostic_text_ids" CHECK(length("diagnostic_text_reports"."report_id")=36 AND length("diagnostic_text_reports"."conversion_id")=36),
	CONSTRAINT "diagnostic_text_mode" CHECK("diagnostic_text_reports"."mode" IN ('preset','ai')),
	CONSTRAINT "diagnostic_text_language" CHECK("diagnostic_text_reports"."language" IN ('ja','en')),
	CONSTRAINT "diagnostic_text_category" CHECK("diagnostic_text_reports"."category" = 'other'),
	CONSTRAINT "diagnostic_text_text_consent" CHECK(("diagnostic_text_reports"."includes_text"=1 AND "diagnostic_text_reports"."original_text" IS NOT NULL AND "diagnostic_text_reports"."rewritten_text" IS NOT NULL AND length("diagnostic_text_reports"."original_text")<=3000 AND length("diagnostic_text_reports"."rewritten_text")<=3000 AND length("diagnostic_text_reports"."original_text")+length("diagnostic_text_reports"."rewritten_text")>0)),
	CONSTRAINT "diagnostic_text_version" CHECK(length("diagnostic_text_reports"."app_version") BETWEEN 1 AND 32 AND "diagnostic_text_reports"."consent_version"='2026-10-18.4'),
	CONSTRAINT "diagnostic_text_date" CHECK(length("diagnostic_text_reports"."server_received_at")=24)
);
--> statement-breakpoint
CREATE INDEX `diagnostic_text_received_idx` ON `diagnostic_text_reports` (`server_received_at`);--> statement-breakpoint
CREATE INDEX `diagnostic_text_conversion_idx` ON `diagnostic_text_reports` (`conversion_id`);