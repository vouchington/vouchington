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
    if (owner && (owner.post_id !== postId || owner.remote_actor_id !== remoteActorId)) return
    await run(sql`/* lockActivityPubLikePairForUndo */
      SELECT pg_advisory_xact_lock(hashtextextended(
        'activitypub-like:' || ${postId} || ':' || ${remoteActorId}, 0
      ))
    `)
    await run(sql`/* undoLike */
    INSERT INTO activitypub_post_likes
      (post_id, remote_actor_id, like_activitypub_id, deleted_at, confirmed_at)
    VALUES (${postId}, ${remoteActorId}, ${likeApId}, clock_timestamp(), NULL)
    ON CONFLICT (remote_actor_id, like_activitypub_id) DO UPDATE
      SET deleted_at = COALESCE(activitypub_post_likes.deleted_at, EXCLUDED.deleted_at)
      WHERE activitypub_post_likes.post_id = EXCLUDED.post_id
        AND activitypub_post_likes.remote_actor_id = EXCLUDED.remote_actor_id
  `)
  })
}
