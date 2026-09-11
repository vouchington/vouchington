import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Records (or idempotently re-records) a remote actor's Like on a local post. Isolated from
// post_votes/votes_score_net by design — see the ap_post_likes migration and
// docs/overview/architecture/fediverse-federation.md's Like reuse-mapping row. `ap_posts`'s tally
// columns stay in sync via the fn_sync_ap_post_likes trigger; this function never touches ap_posts
// directly.
//
// A plain `INSERT ... ON CONFLICT (post_id, remote_actor_id)` cannot resurrect a prior
// soft-deleted row on its own: the unique index backing that conflict target is partial
// (`WHERE deleted_at IS NULL`), so a soft-deleted row falls outside its conflict-detection scope —
// a second INSERT would collide with nothing there. The `resurrect` CTE below explicitly
// reactivates the most recently soft-deleted row for this (post_id, remote_actor_id) pair first
// (repeated Like/Undo cycles can leave more than one soft-deleted row behind; `LIMIT 1 FOR UPDATE`
// locks and resurrects only the latest, leaving earlier cycles as history). The INSERT only fires
// when nothing was resurrected, falling through to the ordinary `ON CONFLICT ... DO UPDATE` for
// the already-active-row case — a redelivered Like carrying the same or an updated `like_ap_id`.
export async function recordLike(
  postId: string,
  remoteActorId: string,
  likeApId: string,
  options: QueryOptions = {},
): Promise<void> {
  const run = options.query ?? write
  await run(sql`/* recordLike */
    WITH target AS (
      SELECT id
      FROM ap_post_likes
      WHERE post_id = ${postId}
        AND remote_actor_id = ${remoteActorId}
        AND deleted_at IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    ),
    resurrect AS (
      UPDATE ap_post_likes
      SET deleted_at = NULL, like_ap_id = ${likeApId}
      WHERE id IN (SELECT id FROM target)
      RETURNING id
    )
    INSERT INTO ap_post_likes (post_id, remote_actor_id, like_ap_id)
    SELECT ${postId}, ${remoteActorId}, ${likeApId}
    WHERE NOT EXISTS (SELECT 1 FROM resurrect)
    ON CONFLICT (post_id, remote_actor_id) WHERE deleted_at IS NULL
    DO UPDATE SET like_ap_id = EXCLUDED.like_ap_id
  `)
}
