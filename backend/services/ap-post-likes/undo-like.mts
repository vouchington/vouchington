import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Soft-deletes the active Like row for this (post_id, remote_actor_id) pair, if one exists.
// No-ops (0 rows affected) when there is no active Like — the out-of-order Undo-before-Like case,
// or a redelivered Undo for an already-undone Like. fn_sync_ap_post_likes keeps ap_posts's tally
// in sync with the resulting deleted_at.
export async function undoLike(
  postId: string,
  remoteActorId: string,
  options: QueryOptions = {},
): Promise<void> {
  const run = options.query ?? write
  await run(sql`/* undoLike */
    UPDATE ap_post_likes
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE post_id = ${postId}
      AND remote_actor_id = ${remoteActorId}
      AND deleted_at IS NULL
  `)
}
