export const MODERATION_CLEANUP_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'moderation_media_reveal_cleanup_cursors.cursor_reveal_id',
    'Operational keyset position survives deletion of the swept reveal; it is not a relationship.',
  ],
  [
    'moderation_queue_claim_cleanup_cursors.cursor_claim_id',
    'Operational keyset position survives deletion of the swept claim; it is not a relationship.',
  ],
  [
    'moderation_record_cleanup_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 keyset position can outlive the scanned moderation record; it is not a relationship.',
  ],
  [
    'moderation_record_cleanup_cursors.sweep_upper_bound_record_id',
    'Frozen UUIDv7 timestamp boundary for one bounded sweep; it is not a relationship.',
  ],
  [
    'post_moderation_retention_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 keyset position can outlive the scanned moderation version or disposition; it is not a relationship.',
  ],
  [
    'post_moderation_retention_cursors.cursor_lower_bound_record_id',
    'Frozen UUIDv7 lower boundary for one bounded retention pass; it is not a relationship.',
  ],
  [
    'post_moderation_retention_cursors.sweep_upper_bound_record_id',
    'Frozen UUIDv7 upper boundary for one bounded retention pass; it is not a relationship.',
  ],
  [
    'post_moderation_retention_cursors.cursor_policy_version_record_id',
    'One-time policy revision sweep position can outlive the examined version; it is not a relationship.',
  ],
  [
    'post_moderation_retention_post_work_items.cursor_version_record_id',
    'Per-post work position can outlive the examined version; it is not a relationship.',
  ],
  [
    'post_moderation_retention_post_work_items.cursor_processing_version_record_id',
    'In-progress subpage coordinate can outlive the examined version; it is not a relationship.',
  ],
  [
    'post_moderation_retention_post_work_items.cursor_disposition_record_id',
    'Per-version work position can outlive the examined disposition; it is not a relationship.',
  ],
])
