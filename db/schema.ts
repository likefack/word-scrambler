import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Diagnostic metadata only. Do not add request bodies, identities, or error text. */
export const errorReports = sqliteTable('error_reports', {
  reportId: text('report_id').primaryKey().notNull(),
  requestId: text('request_id').notNull(),
  code: text('code').notNull(),
  stage: text('stage').notNull(),
  httpStatus: integer('http_status').notNull(),
  upstreamStatus: integer('upstream_status'),
  version: text('version').notNull(),
  timestamp: text('timestamp').notNull(),
  serverReceivedAt: text('server_received_at').notNull(),
}, table => [
  // A client-only failure has no server request ID. Its report UUID deduplicates
  // retries; the literal sentinel must not collapse unrelated client failures.
  uniqueIndex('error_reports_request_id_unique').on(table.requestId).where(sql`${table.requestId} <> 'unavailable'`),
  index('error_reports_received_at_idx').on(table.serverReceivedAt),
  check('error_reports_id_lengths', sql`length(${table.reportId}) = 36 AND (length(${table.requestId}) = 36 OR ${table.requestId} = 'unavailable')`),
  check('error_reports_code_length', sql`length(${table.code}) BETWEEN 1 AND 64`),
  check('error_reports_stage_length', sql`length(${table.stage}) BETWEEN 1 AND 32`),
  check('error_reports_version_length', sql`length(${table.version}) BETWEEN 1 AND 32`),
  check('error_reports_date_lengths', sql`length(${table.timestamp}) = 24 AND length(${table.serverReceivedAt}) = 24`),
  check('error_reports_http_status_bounds', sql`${table.httpStatus} = 0 OR ${table.httpStatus} BETWEEN 100 AND 599`),
  check('error_reports_upstream_status_bounds', sql`${table.upstreamStatus} IS NULL OR ${table.upstreamStatus} BETWEEN 100 AND 599`),
]);
