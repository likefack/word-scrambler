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

/** Fixed, content-free conversion diagnostics. Identity and text are intentionally absent. */
export const conversionDiagnostics = sqliteTable('conversion_diagnostics', {
  conversionId: text('conversion_id').primaryKey().notNull(),
  source: text('source').notNull(),
  appVersion: text('app_version').notNull(),
  consentVersion: text('consent_version').notNull(),
  mode: text('mode').notNull(),
  providerCategory: text('provider_category').notNull(),
  language: text('language').notNull(),
  style: text('style').notNull(),
  totalWords: integer('total_words').notNull(),
  proposed: integer('proposed').notNull(),
  applied: integer('applied').notNull(),
  changedWords: integer('changed_words').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  providerMs: integer('provider_ms').notNull(),
  validationMs: integer('validation_ms').notNull(),
  status: text('status').notNull(),
  stage: text('stage').notNull(),
  serverReceivedAt: text('server_received_at').notNull(),
  rejectContextDuplicate: integer('reject_context_duplicate').notNull().default(0),
  rejectGrammarJoin: integer('reject_grammar_join').notNull().default(0),
  rejectScopeChange: integer('reject_scope_change').notNull().default(0),
  rejectSemanticAttribute: integer('reject_semantic_attribute').notNull().default(0),
  rejectInvalidEdit: integer('reject_invalid_edit').notNull().default(0),
  rejectUnchanged: integer('reject_unchanged').notNull().default(0),
  rejectOriginalNotFound: integer('reject_original_not_found').notNull().default(0),
  rejectOccurrenceOutOfRange: integer('reject_occurrence_out_of_range').notNull().default(0),
  rejectOverlap: integer('reject_overlap').notNull().default(0),
  rejectImmutableChange: integer('reject_immutable_change').notNull().default(0),
  rejectNewlineChange: integer('reject_newline_change').notNull().default(0),
  rejectEditTooLarge: integer('reject_edit_too_large').notNull().default(0),
  rejectTotalBudget: integer('reject_total_budget').notNull().default(0),
  rejectTargetReached: integer('reject_target_reached').notNull().default(0),
  rejectProtectedTerm: integer('reject_protected_term').notNull().default(0),
  rejectFullTextBudget: integer('reject_full_text_budget').notNull().default(0),
  rejectLimit: integer('reject_limit').notNull().default(0),
}, table => [
  index('conversion_diagnostics_received_idx').on(table.serverReceivedAt),
  check('conversion_diagnostics_source', sql`(${table.source} = 'preset_client' AND ${table.mode} = 'preset') OR (${table.source} = 'ai_server' AND ${table.mode} = 'ai')`),
  check('conversion_diagnostics_language', sql`${table.language} IN ('ja','en','unknown')`),
  check('conversion_diagnostics_style', sql`${table.style} IN ('business','academic','casual','unknown')`),
  check('conversion_diagnostics_state', sql`${table.status} IN ('ok','failed')`),
  check('conversion_diagnostics_words', sql`${table.totalWords} BETWEEN 0 AND 3000 AND ${table.changedWords} BETWEEN 0 AND ${table.totalWords}`),
  check('conversion_diagnostics_candidates', sql`${table.proposed} BETWEEN 0 AND 512 AND ${table.applied} BETWEEN 0 AND ${table.proposed}`),
  check('conversion_diagnostics_times', sql`${table.elapsedMs} BETWEEN 0 AND 180000 AND ${table.providerMs} BETWEEN 0 AND ${table.elapsedMs} AND ${table.validationMs} BETWEEN 0 AND ${table.elapsedMs}`),
]);

// Add this table export to db/schema.ts. Existing imports already include these symbols.
// status is an intake state only. Forwarding proof is private Gmail UUID matching.
export const contactSubmissions = sqliteTable('contact_submissions', {
  submissionId: text('submission_id').primaryKey().notNull(),
  replyEmail: text('reply_email'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  consentVersion: text('consent_version').notNull(),
  consentedAt: text('consented_at').notNull(),
  replyRequested: integer('reply_requested').notNull(),
  serverReceivedAt: text('server_received_at').notNull(),
  status: text('status').default('pending').notNull(),
}, table => [
  index('contact_received_at_idx').on(table.serverReceivedAt),
  index('contact_status_received_idx').on(table.status, table.serverReceivedAt),
  check('contact_id_length', sql`length(${table.submissionId}) = 36`),
  check('contact_email_length', sql`${table.replyEmail} IS NULL OR length(${table.replyEmail}) BETWEEN 3 AND 254`),
  check('contact_subject_length', sql`length(${table.subject}) BETWEEN 1 AND 120`),
  check('contact_body_length', sql`length(${table.body}) BETWEEN 1 AND 4000`),
  check('contact_consent_version_length', sql`length(${table.consentVersion}) BETWEEN 1 AND 32`),
  check('contact_date_lengths', sql`length(${table.consentedAt}) = 24 AND length(${table.serverReceivedAt}) = 24`),
  check('contact_reply_consent', sql`(${table.replyRequested} = 0 AND ${table.replyEmail} IS NULL) OR (${table.replyRequested} = 1 AND ${table.replyEmail} IS NOT NULL)`),
  check('contact_status_values', sql`${table.status} = 'pending'`),
]);

/** Explicit user-reviewed issue reports, separate from content-free diagnostics.
 * No public read endpoint. Never include this table in contact mail forwarding. */
export const textIssueReports = sqliteTable('text_issue_reports', {
  reportId: text('report_id').primaryKey().notNull(),
  conversionId: text('conversion_id').notNull(),
  appVersion: text('app_version').notNull(),
  mode: text('mode').notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(),
  includesText: integer('includes_text').notNull(),
  originalText: text('original_text'),
  rewrittenText: text('rewritten_text'),
  consentVersion: text('consent_version').notNull(),
  serverReceivedAt: text('server_received_at').notNull(),
}, table=>[
  index('text_issue_received_idx').on(table.serverReceivedAt),
  index('text_issue_conversion_idx').on(table.conversionId),
  check('text_issue_ids',sql`length(${table.reportId})=36 AND length(${table.conversionId})=36`),
  check('text_issue_mode',sql`${table.mode} IN ('preset','ai')`),
  check('text_issue_language',sql`${table.language} IN ('ja','en')`),
  check('text_issue_category',sql`${table.category} IN ('grammar','meaning','low_changes','other')`),
  check('text_issue_text_consent',sql`(${table.includesText}=0 AND ${table.originalText} IS NULL AND ${table.rewrittenText} IS NULL) OR (${table.includesText}=1 AND ${table.originalText} IS NOT NULL AND ${table.rewrittenText} IS NOT NULL AND length(${table.originalText})<=3000 AND length(${table.rewrittenText})<=3000 AND length(${table.originalText})+length(${table.rewrittenText})>0)`),
  check('text_issue_version',sql`length(${table.appVersion}) BETWEEN 1 AND 32 AND ${table.consentVersion}='2026-10-18.2'`),
  check('text_issue_date',sql`length(${table.serverReceivedAt})=24`),
]);

/** Disabled until separately approved private setup. No UI/admin activation API. */
export const contactMailOutbox = sqliteTable('contact_mail_outbox', {
  submissionId: text('submission_id').primaryKey().notNull().references(()=>contactSubmissions.submissionId,{onDelete:'cascade'}),
  state: text('state').notNull().default('pending'),
  claimId: text('claim_id'),
  leaseUntil: integer('lease_until'),
  nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  sentAt: integer('sent_at'),
  reason: text('reason'),
}, t=>[
  index('contact_mail_ready').on(t.state,t.nextAttemptAt),
  check('contact_mail_state',sql`${t.state} IN ('pending','claimed','sending','sent','unknown','blocked')`),
  check('contact_mail_claim_id',sql`${t.claimId} IS NULL OR length(${t.claimId})=36`),
  check('contact_mail_attempts',sql`${t.attempts}>=0`),
  check('contact_mail_reason',sql`${t.reason} IS NULL OR ${t.reason} IN ('SEND_INTERRUPTED','SEND_UNCERTAIN','CONTENT_CHECK')`),
]);
export const contactMailNonces = sqliteTable('contact_mail_nonces', {
  nonce: text('nonce').primaryKey().notNull(),
  expiresAt: integer('expires_at').notNull(),
},t=>[check('contact_mail_nonce_length',sql`length(${t.nonce})=36`),index('contact_mail_nonce_expiry').on(t.expiresAt)]);

/** Global anonymous admission only: no client identities, content, keys or hashes. */
export const publicApiAdmissions = sqliteTable('public_api_admissions', {
  requestId: text('request_id').primaryKey().notNull(),
  route: text('route').notNull(),
  createdAt: integer('created_at').notNull(),
  activeLeaseUntil: integer('active_lease_until'),
}, table => [
  index('public_api_admission_route_created').on(table.route, table.createdAt),
  index('public_api_admission_route_lease').on(table.route, table.activeLeaseUntil),
  index('public_api_admission_created_idx').on(table.createdAt),
  check('public_api_admission_uuid', sql`length(${table.requestId}) = 36 AND substr(${table.requestId},9,1) = '-' AND substr(${table.requestId},14,1) = '-' AND substr(${table.requestId},19,1) = '-' AND substr(${table.requestId},24,1) = '-' AND length(replace(${table.requestId},'-','')) = 32 AND replace(${table.requestId},'-','') NOT GLOB '*[^0-9a-f]*'`),
  check('public_api_admission_route', sql`${table.route} IN ('rewrite','contact','diagnostics','error_reports','issue_reports')`),
  check('public_api_admission_created', sql`typeof(${table.createdAt}) = 'integer' AND ${table.createdAt} >= 0`),
  check('public_api_admission_lease', sql`${table.activeLeaseUntil} IS NULL OR (${table.route} = 'rewrite' AND typeof(${table.activeLeaseUntil}) = 'integer' AND ${table.activeLeaseUntil} >= ${table.createdAt} AND ${table.activeLeaseUntil} <= ${table.createdAt} + 90000)`),
]);


/** Explicit, reviewed diagnostic attachment. Never forward via contact mail. */
export const diagnosticTextReports = sqliteTable('diagnostic_text_reports', {
  reportId: text('report_id').primaryKey().notNull(),
  conversionId: text('conversion_id').notNull(),
  appVersion: text('app_version').notNull(),
  mode: text('mode').notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(),
  includesText: integer('includes_text').notNull(),
  originalText: text('original_text'),
  rewrittenText: text('rewritten_text'),
  consentVersion: text('consent_version').notNull(),
  serverReceivedAt: text('server_received_at').notNull(),
}, table=>[
  index('diagnostic_text_received_idx').on(table.serverReceivedAt),
  index('diagnostic_text_conversion_idx').on(table.conversionId),
  check('diagnostic_text_ids',sql`length(${table.reportId})=36 AND length(${table.conversionId})=36`),
  check('diagnostic_text_mode',sql`${table.mode} IN ('preset','ai')`),
  check('diagnostic_text_language',sql`${table.language} IN ('ja','en')`),
  check('diagnostic_text_category',sql`${table.category} = 'other'`),
  check('diagnostic_text_text_consent',sql`(${table.includesText}=1 AND ${table.originalText} IS NOT NULL AND ${table.rewrittenText} IS NOT NULL AND length(${table.originalText})<=3000 AND length(${table.rewrittenText})<=3000 AND length(${table.originalText})+length(${table.rewrittenText})>0)`),
  check('diagnostic_text_version',sql`length(${table.appVersion}) BETWEEN 1 AND 32 AND ${table.consentVersion}='2026-10-18.4'`),
  check('diagnostic_text_date',sql`length(${table.serverReceivedAt})=24`),
]);

/** Execution-time sending selection; never interpret this as affirmative consent. */
export const automaticDiagnosticTextReports = sqliteTable('automatic_diagnostic_text_reports', {
 reportId:text('report_id').primaryKey().notNull(), conversionId:text('conversion_id').notNull(),
 appVersion:text('app_version').notNull(),mode:text('mode').notNull(),language:text('language').notNull(),
 originalText:text('original_text').notNull(),rewrittenText:text('rewritten_text').notNull(),
 selectionOnAtExecution:integer('selection_on_at_execution').notNull(),noticeVersion:text('notice_version').notNull(),serverReceivedAt:text('server_received_at').notNull(),
},table=>[
 index('automatic_text_received_idx').on(table.serverReceivedAt),index('automatic_text_conversion_idx').on(table.conversionId),
 check('automatic_text_ids',sql`length(${table.reportId})=36 AND length(${table.conversionId})=36`),
 check('automatic_text_mode',sql`${table.mode} IN ('preset','ai')`),check('automatic_text_language',sql`${table.language} IN ('ja','en')`),
 check('automatic_text_content',sql`length(${table.originalText}) BETWEEN 1 AND 3000 AND length(${table.rewrittenText}) BETWEEN 1 AND 3000`),
 check('automatic_text_selected',sql`${table.selectionOnAtExecution}=1`),check('automatic_text_notice',sql`${table.noticeVersion}='2026-10-18.5' AND length(${table.appVersion}) BETWEEN 1 AND 32`),
 check('automatic_text_received',sql`length(${table.serverReceivedAt})=24`),
]);
