import { DATA_RETENTION_MAX_VALUES, dataRetentionConfig } from '@services/data-retention/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const dataRetentionRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'data-retention-config',
  label: 'Data Retention',
  description: 'Per-run batch bounds for general and moderation-history retention cleanup.',
  config: dataRetentionConfig,
  access: { update_roles: ['developer'] },
  fields: {
    topic_import_attempt_batch_size: {
      description: 'Topic import attempt rows per retention page.',
      minValue: 1,
      maxValue: 250,
      integer: true,
    },
    moderation_batch_size: {
      description: 'Moderation source rows processed per retention page, plus one lookahead row.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.moderation_batch_size,
      integer: true,
    },
    moderation_max_batches_per_run: {
      description:
        'Maximum keyset pages each moderation record family examines per job; unfinished families immediately continue in another bounded job.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.moderation_max_batches_per_run,
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
  },
})
