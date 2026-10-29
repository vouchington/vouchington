import { electedVoteTables, reviewed } from './relational-storage-reviewed-id-groups.mts'
import { REVIEWED_RETENTION_CURSOR_IDS } from './relational-storage-retention-cursors.mts'

// Reviewed non-relationship ids. Each key is an exact table.column from the committed PostgreSQL
// schema snapshot with a one-line reason. The two categories are defined in
// docs/development/postgres-schema-rules.md#prelaunch-relational-storage. A key that gains a
// foreign key, or leaves the schema, is stale and must be removed.

// Opaque ids with no owning row to reference: client tokens, traversal cursors, protocol ids.
export const ALLOWED_TOKEN_CURSOR_PROTOCOL_ID = new Map<string, string>([
  ...REVIEWED_RETENTION_CURSOR_IDS,
  [
    'copyright_notice_email_intake_receipts.current_preservation_hold_token',
    'Opaque current receipt preservation transition token; never joined or used as entity authority.',
  ],
  ...reviewed(
    'Deletion-stable retention keyset coordinate or frozen sweep bound; the swept source row may no longer exist.',
    [
      'copyright_notice_minimal_purge_cursors.cursor_notice_id',
      'copyright_notice_minimal_purge_continuations.cursor_purge_record_id',
      'copyright_key_orphan_cleanup_cursors.cursor_key_id',
      'copyright_key_orphan_cleanup_cursors.cursor_storage_object_id',
      'copyright_replay_cleanup_cursors.cursor_record_id',
      'copyright_submission_key_retention_cursors.cursor_record_id',
      'legal_record_retention_cursors.cursor_record_id',
      'legal_record_retention_cursors.cursor_sweep_upper_id',
      'payment_ledger_retention_cursors.cursor_record_id',
    ],
  ),
  ...reviewed(
    'Persisted retention keyset bound; the referenced row can be deleted before the next page and must not be a foreign key.',
    [
      'media_delivery_change_retention_cursors.cursor_change_id',
      'media_delivery_change_retention_cursors.sweep_upper_bound_change_id',
    ],
  ),
  [
    'moderation_record_cleanup_cursors.cursor_record_id',
    'Deletion-stable moderation keyset position survives examined record deletion; it is not a relationship.',
  ],
  [
    'moderation_record_cleanup_cursors.sweep_upper_bound_record_id',
    'Frozen moderation UUIDv7 sweep bound is a position, not a relationship to an owning record.',
  ],
  [
    'membership_operational_cleanup_cursors.cursor_id',
    'Deletion-stable keyset position shared by three bounded cleanup streams; the scanned row is removed before checkpointing.',
  ],
  [
    'notification_email_retention_cleanup_cursors.cursor_notification_id',
    'Notification keyset position survives deletion of an examined notification; it is not a relationship.',
  ],
  [
    'notification_email_retention_cleanup_cursors.cursor_notification_partition_id',
    'Notification partition tie-breaker survives deletion of its former owner; it is not a relationship.',
  ],
  [
    'security_retention_cleanup_cursors.cursor_id',
    'Deletion-stable last scanned UUIDv7 keyset position; the swept source row may be gone.',
  ],
  [
    'copyright_dsa_statement_submissions.transparency_database_uuid',
    'Commission statement UUID returned by the external DSA protocol; no Voucha row owns it.',
  ],
  ...reviewed('Client-issued device token; no devices table exists.', [
    'agent_moderation_votes.device_id',
    ...electedVoteTables.map(table => `${table}.device_id`),
    'hostname_votes.device_id',
    'post_votes.device_id',
    'rss_feed_item_votes.device_id',
    'topic_votes.device_id',
    'user_sessions.device_id',
    'user_vouch_votes.device_id',
  ]),
  [
    'session_referral_attributions.session_id',
    'Anonymous session id from the auth cookie; sessions live outside PostgreSQL.',
  ],
  [
    'oauth_authorizations.initiating_device_id',
    'Device JWT id that must still match at completion; no devices table exists.',
  ],
  [
    'oauth_authorizations.initiating_session_id',
    'Session JWT id that must still match at completion; sessions live outside PostgreSQL.',
  ],
  [
    'oauth_authorizations.result_device_id',
    'Device id allocated for replayable token issuance; no devices table exists.',
  ],
  [
    'oauth_authorizations.result_session_id',
    'Session id allocated before token issuance so replay reuses it; no row exists yet.',
  ],
  [
    'notification_push_intent_retention_cursors.cursor_notification_push_intent_id',
    'UUIDv7 traversal position survives deletion of the scanned intent so a sweep cannot rewind.',
  ],
  [
    'notification_push_intent_retention_cursors.sweep_upper_bound_notification_push_intent_id',
    'Frozen UUIDv7 age bound is a timestamp boundary, not a pointer to a persisted intent.',
  ],
  [
    'post_votes.outbound_activitypub_like_activity_id',
    'Identity of the outbound ActivityPub Like; no activities table exists.',
  ],
  [
    'post_votes.outbound_activitypub_original_like_activity_id',
    'Identity of the original outbound ActivityPub Like; no activities table exists.',
  ],
  [
    'relation__user__follow__user.outbound_activitypub_follow_activity_id',
    'Identity of the outbound ActivityPub Follow; no activities table exists.',
  ],
  [
    'relation__user__follow__user.outbound_activitypub_distributed_activity_id',
    'Identity of the current outbound Follow or UndoFollow generation; no activities table exists.',
  ],
  [
    'user_deletion_external_works.work_key',
    'Provider idempotency key while work is pending; it names no Voucha entity.',
  ],
  [
    'mcp_call_audit_events.correlation_id',
    'Server-minted id shared by the audit rows of one MCP request; it names no Voucha entity.',
  ],
  [
    'moderation_report_judgements.run_id',
    'GlideMQ report-judgement run identity; queue jobs live outside PostgreSQL, while this unique correlation key supports exact result polling and retry replay.',
  ],
  [
    'rss_feed_item_category_snapshot_reconciliations.change_id',
    'Opaque notification enqueue identity with no owning entity row; stable across exact snapshot replay and fresh after each edit or acknowledged-row recreation.',
  ],
])
