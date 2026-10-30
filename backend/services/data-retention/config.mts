import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

import {
  DEFAULT_DATA_RETENTION_CONFIG,
  DATA_RETENTION_MAX_VALUES,
  type DataRetentionConfig,
  type DataRetentionLimits,
} from './config-values.mts'
export {
  DEFAULT_DATA_RETENTION_CONFIG,
  DATA_RETENTION_MAX_VALUES,
  type DataRetentionConfig,
  type DataRetentionLimits,
} from './config-values.mts'

const DATA_RETENTION_CONFIG_KEY = 'data-retention-config'

export const dataRetentionConfig = new DynamicConfig({
  key: DATA_RETENTION_CONFIG_KEY,
  fieldTypes: {
    ai_usage_raw_retention_days: 'number',
    batch_size: 'number',
    classifier_retention_days: 'number',
    post_moderation_retention_days: 'number',
    max_batches_per_run: 'number',
    community_moderator_scan_page_size: 'number',
    community_purge_batch_size: 'number',
    topic_import_attempt_batch_size: 'number',
    partition_status_probe_limit: 'number',
    identity_attempt_retention_months: 'number',
    deletion_proof_retention_months: 'number',
    released_hold_retention_months: 'number',
    payment_ledger_retention_months: 'number',
    copyright_minimal_case_batch_size: 'number',
    copyright_minimal_page_size: 'number',
    copyright_minimal_max_pages_per_case: 'number',
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

export function getCopyrightMinimalPurgeLimits() {
  return {
    caseBatchSize: readDataRetentionField('copyright_minimal_case_batch_size'),
    pageSize: readDataRetentionField('copyright_minimal_page_size'),
    maxPagesPerCase: readDataRetentionField('copyright_minimal_max_pages_per_case'),
  }
}

/** Approved non-copyright defaults remain independent, runtime-configurable windows. */
export function getLegalRecordRetentionWindows() {
  return {
    identityAttemptMonths: readDataRetentionField('identity_attempt_retention_months'),
    deletionProofMonths: readDataRetentionField('deletion_proof_retention_months'),
    releasedHoldMonths: readDataRetentionField('released_hold_retention_months'),
    paymentLedgerMonths: readDataRetentionField('payment_ledger_retention_months'),
  }
}

/** Each account review has its own six-calendar-year clock, independent of case activity. */

export function getClassifierRetentionDays(): number {
  return Math.max(90, readDataRetentionField('classifier_retention_days'))
}

export function getPostModerationRetentionDays(): number {
  return Math.max(90, readDataRetentionField('post_moderation_retention_days'))
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

export function getAiUsageRawRetentionDays(): number {
  return Math.max(180, readDataRetentionField('ai_usage_raw_retention_days'))
}
