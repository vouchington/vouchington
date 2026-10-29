import { assertRemoteActivityHost } from '@modules/activitypub-uris'
import { withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActivityPubLikeIdentity } from './activity-identity.mts'

// An Undo records the embedded Like id even when it arrives before the Like. The scope
// comparison prevents an actor from undoing another actor's activity id.
export async function undoLike(
  postId: string,
  remoteActor: { id: string; actor_uri: string },
  likeApId: string,
  options: QueryOptions = {},
): Promise<void> {
  assertRemoteActivityHost(likeApId, remoteActor.actor_uri)
  const remoteActorId = remoteActor.id
  await withTransactionOptions(options, async run => {
    const owner = await lockActivityPubLikeIdentity(run, likeApId)
    if (owner && (owner.post_id !== postId || owner.remote_actor_identity_id !== remoteActorId))
      return
    await run(sql`/* lockActivityPubLikePairForUndo */
      SELECT pg_advisory_xact_lock(hashtextextended(
        'activitypub-like:' || ${postId} || ':' || ${remoteActorId}, 0
      ))
    `)
    await run(sql`/* undoLike */
    WITH cycle AS (
      INSERT INTO activitypub_post_like_activities
        (activity_id, post_id, remote_actor_identity_id, undone_at, confirmed_at)
      VALUES (${likeApId}, ${postId}, ${remoteActorId}, clock_timestamp(), NULL)
      ON CONFLICT (remote_actor_identity_id, activity_id) DO UPDATE
        SET undone_at = COALESCE(activitypub_post_like_activities.undone_at, EXCLUDED.undone_at)
        WHERE activitypub_post_like_activities.post_id = EXCLUDED.post_id
          AND activitypub_post_like_activities.remote_actor_identity_id = EXCLUDED.remote_actor_identity_id
      RETURNING id
    )
    INSERT INTO activitypub_post_likes (id, post_id, remote_actor_id, deleted_at)
    SELECT id, ${postId}, ${remoteActorId}, clock_timestamp() FROM cycle
    ORDER BY id ASC NULLS LAST
    ON CONFLICT (id) DO UPDATE
      SET deleted_at = COALESCE(activitypub_post_likes.deleted_at, EXCLUDED.deleted_at)
  `)
  })
}
