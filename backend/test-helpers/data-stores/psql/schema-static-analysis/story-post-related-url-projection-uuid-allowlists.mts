/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'story_post_related_url_projection_jobs.lease_token',
    'Opaque fencing token rotated for each projection worker lease; it intentionally identifies no durable relation.',
  ],
  [
    'story_post_related_url_projection_jobs.prune_cursor_id',
    'Keyset cursor over relation IDs; it records traversal position rather than a durable relation.',
  ],
  [
    'story_post_related_url_projection_jobs.relation_high_water_id',
    'Immutable relation snapshot boundary; it intentionally remains usable when a captured relation is deleted.',
  ],
  [
    'story_post_related_url_projection_jobs.source_cursor_id',
    'Keyset cursor over RSS item IDs; it records traversal position rather than a durable relation.',
  ],
  [
    'story_post_related_url_projection_jobs.source_high_water_id',
    'Immutable RSS item snapshot boundary; it intentionally remains usable when the source item is deleted.',
  ],
])
/* v8 ignore stop */
