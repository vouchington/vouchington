import { DATA_RETENTION_MAX_VALUES, dataRetentionConfig } from '@services/data-retention/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const dataRetentionRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'data-retention-config',
  label: 'Data Retention',
  description: 'Per-run batch bounds for general and moderation-history retention cleanup.',
  config: dataRetentionConfig,
  access: { update_roles: ['developer'] },
  fields: {
    community_moderator_scan_page_size: {
      description:
        'Moderator memberships read before checking account eligibility in one purge page.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.community_moderator_scan_page_size,
      integer: true,
    },
    community_purge_batch_size: {
      description: 'Owned communities settled per final user purge page.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.community_purge_batch_size,
      integer: true,
    },
    topic_import_attempt_batch_size: {
      description: 'Topic import attempt rows per retention page.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.topic_import_attempt_batch_size,
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
    ses_bounce_retention_days: {
      description: 'Age in days before folded raw SES bounce and complaint events are deleted.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.ses_bounce_retention_days,
      integer: true,
    },
    vote_integrity_detail_days: {
      description: 'Days identifying vote integrity flag details remain before redaction.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.vote_integrity_detail_days,
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
    ai_retention_page_size: {
      description: 'Maximum rows in each persisted AI retention page.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.ai_retention_page_size,
      integer: true,
    },
    ai_retention_max_pages_per_run: {
      description: 'Maximum persisted AI retention pages in one cleanup run.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.ai_retention_max_pages_per_run,
      integer: true,
    },
    classifier_retention_days: {
      description:
        'Minimum age in days for retiring completed classifier payloads and result ranges.',
      minValue: 90,
      maxValue: DATA_RETENTION_MAX_VALUES.classifier_retention_days,
      integer: true,
    },
    copyright_form_screening_attempt_days: {
      description: 'Keep prior copyright form screening attempts for this many days.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_form_screening_attempt_days,
      integer: true,
    },
    copyright_action_attempt_days: {
      description: 'Keep prior terminal copyright action executions for this many days.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_action_attempt_days,
      integer: true,
    },
    copyright_delivery_attempt_days: {
      description: 'Keep prior terminal copyright delivery executions for this many days.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_delivery_attempt_days,
      integer: true,
    },
    copyright_guest_capability_days: {
      description: 'Keep expired unused copyright guest capabilities for this many days.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_guest_capability_days,
      integer: true,
    },
    copyright_unlinked_email_intake_days: {
      description:
        'Keep unlinked copyright email intakes after their last activity for this many days.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_unlinked_email_intake_days,
      integer: true,
    },
    copyright_email_thread_reply_days: {
      description:
        'Keep copyright email thread references for this many days after a case becomes inactive.',
      minValue: 1,
      maxValue: DATA_RETENTION_MAX_VALUES.copyright_email_thread_reply_days,
      integer: true,
    },
    post_moderation_retention_days: {
      description:
        'Minimum age of a successor before deleting its previous post moderation version, and age before clearing current automated pass evidence.',
      minValue: 90,
      maxValue: DATA_RETENTION_MAX_VALUES.post_moderation_retention_days,
      integer: true,
    },
  },
})
