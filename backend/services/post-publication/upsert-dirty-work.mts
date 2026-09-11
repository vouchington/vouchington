import type { TransactionQuery } from '@data-stores/psql/types'
import type {
  PostPublicationDirtyWork,
  PostPublicationReason,
  PostPublicationScope,
} from './types.mts'

const SCOPE_COLUMNS = {
  post: 'post_id',
  author: 'author_user_id',
  community: 'community_id',
  rss_feed: 'rss_feed_id',
  topic_alias: 'topic_alias_id',
  story: 'story_id',
} as const satisfies Record<PostPublicationScope['type'], string>

export async function upsertPostPublicationDirtyWork(
  query: TransactionQuery,
  scopeType: PostPublicationScope['type'],
  scopeIds: readonly string[],
  reasons: readonly PostPublicationReason[],
): Promise<PostPublicationDirtyWork[]> {
  if (scopeIds.length === 0) return []
  const scopeColumn = SCOPE_COLUMNS[scopeType]
  // Column names and partial-index conflict targets are SQL syntax rather than bindable values.
  // This closed record is the complete allowlist for both interpolated fragments.
  const { rows } = await query<PostPublicationDirtyWork>(
    `/* upsertPostPublicationDirtyWork */
    WITH input AS (
      SELECT scope_id, ordinality
      FROM unnest($1::uuid[]) WITH ORDINALITY AS input(scope_id, ordinality)
    ), upserted AS (
    INSERT INTO post_publication_dirty_work (${scopeColumn}, reasons)
    SELECT scope_id, $2::text[] FROM input ORDER BY scope_id
    ON CONFLICT (${scopeColumn}) WHERE ${scopeColumn} IS NOT NULL DO UPDATE
    SET reasons = ARRAY(SELECT DISTINCT reason FROM unnest(post_publication_dirty_work.reasons || EXCLUDED.reasons)
      AS merged(reason) ORDER BY reason),
      generation = post_publication_dirty_work.generation + 1,
      cursor_post_id = NULL, cursor_topic_id = NULL, cursor_key_id = NULL, cursor_updated_at = NULL,
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    RETURNING id, post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id, reasons,
      generation, cursor_post_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at
    )
    SELECT upserted.* FROM upserted
    JOIN input ON input.scope_id = upserted.${scopeColumn}
    ORDER BY input.ordinality`,
    [scopeIds, reasons],
  )
  return rows
}
