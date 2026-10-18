CREATE TABLE `public_api_admissions` (
	`request_id` text PRIMARY KEY NOT NULL,
	`route` text NOT NULL,
	`created_at` integer NOT NULL,
	`active_lease_until` integer,
	CONSTRAINT "public_api_admission_uuid" CHECK(length("public_api_admissions"."request_id") = 36 AND substr("public_api_admissions"."request_id",9,1) = '-' AND substr("public_api_admissions"."request_id",14,1) = '-' AND substr("public_api_admissions"."request_id",19,1) = '-' AND substr("public_api_admissions"."request_id",24,1) = '-' AND length(replace("public_api_admissions"."request_id",'-','')) = 32 AND replace("public_api_admissions"."request_id",'-','') NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "public_api_admission_route" CHECK("public_api_admissions"."route" IN ('rewrite','contact','diagnostics','error_reports','issue_reports')),
	CONSTRAINT "public_api_admission_created" CHECK(typeof("public_api_admissions"."created_at") = 'integer' AND "public_api_admissions"."created_at" >= 0),
	CONSTRAINT "public_api_admission_lease" CHECK("public_api_admissions"."active_lease_until" IS NULL OR ("public_api_admissions"."route" = 'rewrite' AND typeof("public_api_admissions"."active_lease_until") = 'integer' AND "public_api_admissions"."active_lease_until" >= "public_api_admissions"."created_at" AND "public_api_admissions"."active_lease_until" <= "public_api_admissions"."created_at" + 90000))
);
--> statement-breakpoint
CREATE INDEX `public_api_admission_route_created` ON `public_api_admissions` (`route`,`created_at`);--> statement-breakpoint
CREATE INDEX `public_api_admission_route_lease` ON `public_api_admissions` (`route`,`active_lease_until`);--> statement-breakpoint
CREATE INDEX `public_api_admission_created_idx` ON `public_api_admissions` (`created_at`);