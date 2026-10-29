import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export type DataRetentionConfig = {
  batch_size: number
  classifier_retention_days: number
  post_moderation_retention_days: number
  community_moderator_scan_page_size: number
  community_purge_batch_size: number
  topic_import_attempt_batch_size: number
  vote_integrity_detail_days: number
  max_batches_per_run: number
  partition_status_probe_limit: number
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

const DATA_RETENTION_CONFIG_KEY = 'data-retention-config'

export const DEFAULT_DATA_RETENTION_CONFIG: DataRetentionConfig = {
  batch_size: 500,
  classifier_retention_days: 90,
  post_moderation_retention_days: 90,
  community_moderator_scan_page_size: 50,
  community_purge_batch_size: 25,
  topic_import_attempt_batch_size: 25,
  vote_integrity_detail_days: 180,
  max_batches_per_run: 200,
  partition_status_probe_limit: 64,
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
  classifier_retention_days: 365,
  post_moderation_retention_days: 365,
  community_moderator_scan_page_size: 250,
  community_purge_batch_size: 250,
  topic_import_attempt_batch_size: 250,
  vote_integrity_detail_days: 180,
  max_batches_per_run: 2_000,
  partition_status_probe_limit: 256,
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

export const dataRetentionConfig = new DynamicConfig({
  key: DATA_RETENTION_CONFIG_KEY,
  fieldTypes: {
    batch_size: 'number',
    classifier_retention_days: 'number',
    post_moderation_retention_days: 'number',
    max_batches_per_run: 'number',
    community_moderator_scan_page_size: 'number',
    community_purge_batch_size: 'number',
    topic_import_attempt_batch_size: 'number',
    partition_status_probe_limit: 'number',
    moderation_batch_size: 'number',
    moderation_max_batches_per_run: 'number',
    ses_bounce_retention_days: 'number',
    ai_retention_page_size: 'number',
    ai_retention_max_pages_per_run: 'number',
    vote_integrity_detail_days: 'number',
    copyright_form_screening_attempt_days: 'number',
    copyright_action_attempt_days: 'number',
    copyright_delivery_attempt_days: 'number',
    copyright_guest_capability_days: 'number',
    copyright_unlinked_email_intake_days: 'number',
    copyright_email_thread_reply_days: 'number',
  },
  defaultFields: DEFAULT_DATA_RETENTION_CONFIG,
})

export function getDataRetentionLimits(): DataRetentionLimits {
  return {
    batchSize: readDataRetentionField('batch_size'),
    maxBatches: readDataRetentionField('max_batches_per_run'),
  }
}

export function readDataRetentionField(field: keyof DataRetentionConfig): number {
  return getBoundedPositiveIntegerField(dataRetentionConfig, field, {
    defaultValue: DEFAULT_DATA_RETENTION_CONFIG[field],
    maxValue: DATA_RETENTION_MAX_VALUES[field],
  })
}

export function getTopicImportAttemptDeletionBatchSize(): number {
  return readDataRetentionField('topic_import_attempt_batch_size')
}

export function getPartitionStatusProbeLimit(): number {
  return readDataRetentionField('partition_status_probe_limit')
}

export function getClassifierRetentionDays(): number {
  return Math.max(90, readDataRetentionField('classifier_retention_days'))
}

export function getPostModerationRetentionDays(): number {
  return Math.max(90, readField('post_moderation_retention_days'))
}

export function getModerationRecordCleanupLimits(): DataRetentionLimits {
  return {
    batchSize: readDataRetentionField('moderation_batch_size'),
    maxBatches: readDataRetentionField('moderation_max_batches_per_run'),
  }
}

export function getSesBounceRetentionDays(): number {
  return readDataRetentionField('ses_bounce_retention_days')
}

export function getAIRetentionPageLimits(): DataRetentionLimits {
  return {
    batchSize: readDataRetentionField('ai_retention_page_size'),
    maxBatches: readDataRetentionField('ai_retention_max_pages_per_run'),
  }
}

export function getCommunityPurgeBatchSize(): number {
  return readDataRetentionField('community_purge_batch_size')
}

export function getCommunityModeratorScanPageSize(): number {
  return readDataRetentionField('community_moderator_scan_page_size')
}

export function getVoteIntegrityDetailRetentionDays(): number {
  return readDataRetentionField('vote_integrity_detail_days')
}
