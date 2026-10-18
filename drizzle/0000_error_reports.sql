CREATE TABLE `error_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`code` text NOT NULL,
	`stage` text NOT NULL,
	`http_status` integer NOT NULL,
	`upstream_status` integer,
	`version` text NOT NULL,
	`timestamp` text NOT NULL,
	`server_received_at` text NOT NULL,
	CONSTRAINT "error_reports_id_lengths" CHECK(length("error_reports"."report_id") = 36 AND (length("error_reports"."request_id") = 36 OR "error_reports"."request_id" = 'unavailable')),
	CONSTRAINT "error_reports_code_length" CHECK(length("error_reports"."code") BETWEEN 1 AND 64),
	CONSTRAINT "error_reports_stage_length" CHECK(length("error_reports"."stage") BETWEEN 1 AND 32),
	CONSTRAINT "error_reports_version_length" CHECK(length("error_reports"."version") BETWEEN 1 AND 32),
	CONSTRAINT "error_reports_date_lengths" CHECK(length("error_reports"."timestamp") = 24 AND length("error_reports"."server_received_at") = 24),
	CONSTRAINT "error_reports_http_status_bounds" CHECK("error_reports"."http_status" = 0 OR "error_reports"."http_status" BETWEEN 100 AND 599),
	CONSTRAINT "error_reports_upstream_status_bounds" CHECK("error_reports"."upstream_status" IS NULL OR "error_reports"."upstream_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `error_reports_request_id_unique` ON `error_reports` (`request_id`) WHERE "error_reports"."request_id" <> 'unavailable';--> statement-breakpoint
CREATE INDEX `error_reports_received_at_idx` ON `error_reports` (`server_received_at`);