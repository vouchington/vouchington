import { DYNAMIC_CONFIG_AUDIT_TABLES } from '../../../../data-stores/psql/dynamic-config-audit-schema.mts'

const AUDIT_SNAPSHOT = 'Append-only audit fact. The parent row owns the lifecycle timestamp.'

export const AUDIT_FACT_MISSING_UPDATED_AT = [
  ...DYNAMIC_CONFIG_AUDIT_TABLES.map(table => [table, AUDIT_SNAPSHOT] as const),
  ['moderator_action_restrictions', AUDIT_SNAPSHOT],
  ['moderator_action_topic_slugs', AUDIT_SNAPSHOT],
  ['post_moderation_disposition_categories', AUDIT_SNAPSHOT],
  ['post_moderation_disposition_signals', AUDIT_SNAPSHOT],
  ['post_revision_categories', AUDIT_SNAPSHOT],
  ['post_revision_data_point_topics', AUDIT_SNAPSHOT],
  ['post_revision_data_points', AUDIT_SNAPSHOT],
  ['post_revision_images', AUDIT_SNAPSHOT],
  ['post_revision_rating_topics', AUDIT_SNAPSHOT],
  ['report_integrity_flag_reporters', AUDIT_SNAPSHOT],
  ['topic_revision_alias_entries', AUDIT_SNAPSHOT],
  ['vote_integrity_flag_ips', AUDIT_SNAPSHOT],
] as const

export const ACTIVITY_LOG_MISSING_UPDATED_AT = [
  ['moderator_actions', 'Append-only unified moderator action log; no updates after insertion.'],
  [
    'moderation_media_reveals',
    'Append-only audit log of disturbing-media reveals by moderators; rows are never updated.',
  ],
  [
    'moderation_queue_claims',
    'Claim lifecycle uses claimed_at / released_at; the only mutation is releasing a claim (writing released_at), so a generic updated_at is redundant.',
  ],
  [
    'autotagger_receipt_attempts',
    'Append-only attempt ledger: the only mutation writes exactly one of completed_at/failed_at, enforced by chk_autotagger_receipt_attempts__terminal_exclusive, so a generic updated_at is redundant.',
  ],
  [
    'ap_inbox_activities',
    'Append-only replay-dedup ledger; rows are inserted once by the inbox receiver and never updated.',
  ],
  ['ap_post_likes', 'Undo/resurrect toggles deleted_at; redelivery refreshes like_ap_id.'],
  ['bluesky_follow_records', 'Redelivery refreshes record_uri; unfollow deletes the row.'],
] as const
