export type DataRetentionConfig = {
  batch_size: number
  ai_usage_raw_retention_days: number
  classifier_retention_days: number
  post_moderation_retention_days: number
  community_moderator_scan_page_size: number
  community_purge_batch_size: number
  topic_import_attempt_batch_size: number
  vote_integrity_detail_days: number
  max_batches_per_run: number
  partition_status_probe_limit: number
  identity_attempt_retention_months: number
  deletion_proof_retention_months: number
  released_hold_retention_months: number
  payment_ledger_retention_months: number
  copyright_minimal_case_batch_size: number
  copyright_minimal_page_size: number
  copyright_minimal_max_pages_per_case: number
  moderation_batch_size: number
  moderation_max_batches_per_run: number
  ses_bounce_retention_days: number
  ai_retention_page_size: number
  ai_retention_max_pages_per_run: number
  copyright_form_screening_attempt_days: number
  copyright_action_attempt_days: number
  copyright_delivery_attempt_days: number
  copyright_guest_capability_days: number
  copyright_unlinked_email_intake_days: number
  copyright_email_thread_reply_days: number
}

/** The per-cleanup limits one retention run applies. Every cleanup in the run takes both. */
export type DataRetentionLimits = {
  batchSize: number
  maxBatches: number
}

export const DEFAULT_DATA_RETENTION_CONFIG: DataRetentionConfig = {
  batch_size: 500,
  ai_usage_raw_retention_days: 180,
  classifier_retention_days: 90,
  post_moderation_retention_days: 90,
  community_moderator_scan_page_size: 50,
  community_purge_batch_size: 25,
  topic_import_attempt_batch_size: 25,
  vote_integrity_detail_days: 180,
  max_batches_per_run: 200,
  partition_status_probe_limit: 64,
  identity_attempt_retention_months: 84,
  deletion_proof_retention_months: 36,
  released_hold_retention_months: 36,
  payment_ledger_retention_months: 84,
  copyright_minimal_case_batch_size: 25,
  copyright_minimal_page_size: 50,
  copyright_minimal_max_pages_per_case: 8,
  moderation_batch_size: 25,
  moderation_max_batches_per_run: 4,
  ses_bounce_retention_days: 90,
  ai_retention_page_size: 500,
  ai_retention_max_pages_per_run: 10,
  copyright_form_screening_attempt_days: 180,
  copyright_action_attempt_days: 180,
  copyright_delivery_attempt_days: 180,
  copyright_guest_capability_days: 90,
  copyright_unlinked_email_intake_days: 90,
  copyright_email_thread_reply_days: 180,
}

export const DATA_RETENTION_MAX_VALUES: DataRetentionConfig = {
  batch_size: 5_000,
  ai_usage_raw_retention_days: 3_650,
  classifier_retention_days: 365,
  post_moderation_retention_days: 365,
  community_moderator_scan_page_size: 250,
  community_purge_batch_size: 250,
  topic_import_attempt_batch_size: 250,
  vote_integrity_detail_days: 180,
  max_batches_per_run: 2_000,
  partition_status_probe_limit: 256,
  identity_attempt_retention_months: 1200,
  deletion_proof_retention_months: 1200,
  released_hold_retention_months: 1200,
  payment_ledger_retention_months: 1200,
  copyright_minimal_case_batch_size: 100,
  copyright_minimal_page_size: 50,
  copyright_minimal_max_pages_per_case: 32,
  moderation_batch_size: 100,
  moderation_max_batches_per_run: 20,
  ses_bounce_retention_days: 365,
  ai_retention_page_size: 500,
  ai_retention_max_pages_per_run: 10,
  copyright_form_screening_attempt_days: 3_650,
  copyright_action_attempt_days: 3_650,
  copyright_delivery_attempt_days: 3_650,
  copyright_guest_capability_days: 3_650,
  copyright_unlinked_email_intake_days: 3_650,
  copyright_email_thread_reply_days: 3_650,
}
