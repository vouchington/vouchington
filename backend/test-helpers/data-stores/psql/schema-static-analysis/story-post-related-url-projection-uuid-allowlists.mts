/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'story_post_category_projection_jobs.sweep_upper_bound_item_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],
  [
    'story_post_category_projection_jobs.cursor_item_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],
  [
    'story_post_category_projection_jobs.active_item_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],
  [
    'story_post_category_projection_jobs.cursor_category_identity_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],
  [
    'story_post_category_projection_jobs.cursor_relation_topic_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],
  [
    'story_post_category_projection_jobs.cursor_receipt_topic_id',
    'Deletion-stable projection keyset position, not a joined relation.',
  ],

  [
    'story_post_related_url_projection_jobs.lease_token',
    'Opaque fencing token rotated for each projection worker lease; it intentionally identifies no durable relation.',
  ],
  [
    'story_post_related_url_projection_jobs.sweep_upper_bound_source_id',
    'Immutable RSS item snapshot boundary; it intentionally remains usable when the source item is deleted.',
  ],
])
/* v8 ignore stop */
