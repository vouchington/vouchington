/** Persisted keyset positions intentionally outlive the scanned rows. */
export const RETENTION_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'follower_distributions.cursor_recipient_id',
    'Deletion-stable recipient UUIDv7 keyset position, not a relationship.',
  ],
  [
    'retained_identity_cleanup_cursors.cursor_identity_id',
    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
  [
    'payment_operational_cleanup_cursors.cursor_id',
    'Operational keyset position survives deletion of the swept row; it is not a relationship.',
  ],
  [
    'auth_session_retention_cleanup_cursors.cursor_id',
    'Keyset scan position survives deletion of the scanned auth, session, or subscription row.',
  ],
  [
    'auth_session_retention_cleanup_cursors.cursor_partition_key',
    'Subscription partition tie-breaker survives deletion of its user and subscription rows.',
  ],
  [
    'retained_image_placement_binding_cleanup_cursors.cursor_placement_id',
    'Operational placement UUIDv7 position survives deletion of the swept binding; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_subject_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_relation_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  [
    'activitypub_distribution_work_items.cursor_remote_actor_id',
    'Durable keyset cursor intentionally survives remote actor deletion so completed fan-out progress cannot rewind.',
  ],
])
