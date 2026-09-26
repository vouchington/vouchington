export const POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'post_publication_identity_bridge_cleanup_progress.cursor_identity_id',
    'Deletion-stable raw sweep cursor; not an entity relationship.',
  ],
  [
    'post_publication_identity_snapshot_keys.topic_key',
    'Immutable topic key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_identity_snapshot_keys.author_key',
    'Immutable author key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_identity_snapshot_keys.community_key',
    'Immutable community key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_identity_snapshot_keys.rss_feed_key',
    'Immutable rss feed key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_dirty_work_keys.topic_key',
    'Immutable topic key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_dirty_work_keys.author_key',
    'Immutable author key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_dirty_work_keys.community_key',
    'Immutable community key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],
  [
    'post_publication_dirty_work_keys.rss_feed_key',
    'Immutable rss feed key projection token used only for cache/rating compensation and exact set comparison; never joined to a live entity.',
  ],

  [
    'post_publication_identity_cleanup_progress.cursor_snapshot_id',
    'Sweep checkpoint tombstone intentionally survives deletion of reclaimed snapshot headers.',
  ],
  [
    'notifications.publication_post_id',
    'Stable reconciliation target intentionally survives hard deletion of the referenced post.',
  ],
  [
    'notifications.publication_rss_feed_item_id',
    'Stable reconciliation target intentionally survives hard deletion of the referenced RSS item.',
  ],
  ['post_publication_dirty_work.cursor_post_id', 'Cursor tombstone is not a durable relation.'],
  ['post_publication_dirty_work.cursor_topic_id', 'Cursor tombstone is not a durable relation.'],
  ['post_publication_dirty_work.cursor_key_id', 'Cursor tombstone is not a durable relation.'],
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
