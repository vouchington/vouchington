/**
 * Equivalent `posts__default` access paths for `created_by_id = $1`. A query that also filters
 * `community_id IS NULL` and `deleted_at IS NULL` may be served by any of them, so the planner's
 * cost-based choice differs between custom and generic plans; the scenario's processed-rows cap
 * is what bounds all three.
 */
export const POSTS_CREATOR_INDEXES = [
  'posts__default_created_by_id_idx',
  'posts__default_created_by_id_community_id_id_idx',
  'posts__default_created_by_id_is_anonymous_idx',
] as const
