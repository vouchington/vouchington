import { DATA_RETENTION_MAX_VALUES, dataRetentionConfig } from '@services/data-retention/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const dataRetentionRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'data-retention-config',
  label: 'Data Retention',
  description: 'Per-run batch bounds for the daily data retention cleanup.',
  config: dataRetentionConfig,
  access: { update_roles: ['developer'] },
  fields: {
    ai_usage_raw_retention_days: {
      description: 'Minimum age of AI provider-call records before folding and deletion.',
      minValue: 180,
      maxValue: DATA_RETENTION_MAX_VALUES.ai_usage_raw_retention_days,
      integer: true,
    },
    topic_import_attempt_batch_size: {
      description: 'Topic import attempt rows per retention page.',
      minValue: 1,
      maxValue: 250,
      integer: true,
    },
    batch_size: {
      description: 'Rows each data retention cleanup deletes per batch.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.batch_size,
      integer: true,
    },
    max_batches_per_run: {
      description:
        'Maximum batches each data retention cleanup runs per daily job. A cleanup that hits the cap reports more work and resumes on the next run.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
      integer: true,
    },
    partition_status_probe_limit: {
      description:
        'Maximum eligible partition children checked for holds or in-flight rows in one admin status request. Remaining children are marked check-pending and rechecked during cleanup.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.partition_status_probe_limit,
      integer: true,
    },
    classifier_retention_days: {
      description:
        'Minimum age in days for retiring completed classifier payloads and result ranges.',
      minValue: 90,
      maxValue: DATA_RETENTION_MAX_VALUES.classifier_retention_days,
      integer: true,
    },
  },
})
