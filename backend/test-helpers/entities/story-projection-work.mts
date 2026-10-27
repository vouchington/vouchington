import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ProjectionWork } from '../../services/stories/story-post-related-url-projection-types.mts'

/** Exact fixture identities only; an unclaimable lease is not proof of terminal absence. */
export async function readStoryProjectionWorkForTest(postIds: readonly string[]) {
  if (postIds.length === 0) return []
  const { rows } = await read<{ post_id: string; lease_token: string | null }>(
    sql`/* readStoryProjectionWorkForTest */
      SELECT post_id, lease_token
      FROM story_post_related_url_projection_jobs
      WHERE post_id = ANY(${postIds}::uuid[])
      ORDER BY post_id
      LIMIT ${postIds.length}`,
    { readOnly: false },
  )
  return rows
}

/** Arrange a persisted lease for this fixture without selecting or touching unrelated jobs. */
export async function createTestStoryProjectionLease(postId: string) {
  const { rows } = await write<ProjectionWork>(
    sql`/* createTestStoryProjectionLease */
      UPDATE story_post_related_url_projection_jobs
      SET lease_token = uuidv7(), leased_at = clock_timestamp(),
          last_claimed_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '2 minutes'
      WHERE post_id = ${postId}
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
      RETURNING post_id, story_id, generation, sweep_upper_bound_source_id,
        sweep_upper_bound_relation_id, relation_snapshot_at, cursor_source_id,
        source_completed_at, cursor_prune_id, lease_token`,
  )
  return rows[0] ?? null
}
