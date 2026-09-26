export const POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'post_publication_identity_snapshots.dirty_work_id',
    'Snapshot storage intentionally outlives dirty-work acknowledgement.',
  ],
  [
    'post_publication_identity_snapshots.post_id',
    'Exact accepted identities must survive hard deletion of their post.',
  ],
  [
    'post_publication_identity_snapshot_keys.uuid_value',
    'Typed exact identity tombstones preserve deleted source keys.',
  ],
  [
    'notifications.publication_post_id',
    'Stable reconciliation target intentionally survives hard deletion of the referenced post.',
  ],
  [
    'notifications.publication_rss_feed_item_id',
    'Stable reconciliation target intentionally survives hard deletion of the referenced RSS item.',
  ],
  [
    'post_publication_dirty_work.topic_alias_id',
    'Topic-alias-scope work key preserves reconciliation after alias lifecycle changes.',
  ],
  [
    'post_publication_dirty_work.story_id',
    'Story-scope work key preserves category-remap reconciliation.',
  ],
  ['post_publication_dirty_work.cursor_post_id', 'Cursor tombstone is not a durable relation.'],
  ['post_publication_dirty_work.cursor_topic_id', 'Cursor tombstone is not a durable relation.'],
  ['post_publication_dirty_work.cursor_key_id', 'Cursor tombstone is not a durable relation.'],
  [
    'post_publication_dirty_work_keys.uuid_value',
    'Typed retained impact or identity tombstone has no FK so deletion repair remains possible.',
  ],
  [
    'post_publication_dirty_work.lease_token',
    'Opaque worker fencing token identifies no durable relation.',
  ],
  [
    'post_publication_reconciliation_audit_checkpoints.cursor_post_id',
    'UUID cursor is a checkpoint tombstone, not a durable relation; deletion must not invalidate an operator scan.',
  ],
] as const

export const POST_PUBLICATION_TABLES_WITHOUT_CREATED_AT = [
  [
    'post_publication_dirty_work_keys',
    'Retained-key rows are ordered by UUIDv7 id and cascade on acknowledgement; timing lives on the work parent.',
  ],
] as const

export const POST_PUBLICATION_TABLES_WITHOUT_UPDATED_AT = [
  [
    'post_publication_identity_snapshot_keys',
    'Snapshot identity rows are immutable; attempt checkpoints own progress timing.',
  ],
  [
    'post_publication_dirty_work_keys',
    'Retained-key rows are inserted once and cascade on acknowledgement; parent updated_at owns lifecycle timing.',
  ],
  [
    'post_publication_projection_receipts',
    'applied_at is the lifecycle mutation timestamp refreshed on every successful projection receipt.',
  ],
] as const
