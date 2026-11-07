/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
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
