import { beginTransaction, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActivityPubLikeIdentity } from './activity-identity.mts'

// The activity id owns a durable row across Undo. A fresh Like after Undo gets a new row;
// replaying the old id cannot clear its deleted_at marker after inbox dedup expires.
export async function recordLike(
  postId: string,
  remoteActorId: string,
  likeApId: string,
  options: QueryOptions = {},
): Promise<void> {
  if (options.query) {
    await recordLikeInTransaction(
      options.query as TransactionQuery,
      postId,
      remoteActorId,
      likeApId,
    )
    return
  }
  await using query = await beginTransaction()
  await recordLikeInTransaction(query, postId, remoteActorId, likeApId)
  await query.commit()
}

async function recordLikeInTransaction(
  query: TransactionQuery,
  postId: string,
  remoteActorId: string,
  likeApId: string,
): Promise<void> {
  if (await lockActivityPubLikeIdentity(query, likeApId)) return
  // Serialize per actor/post even when no active row exists yet. An Undo of this exact id
  // races through the all-rows unique index and wins as a terminal tombstone retained beyond the replay horizon.
  await query(sql`/* lockActivityPubLikePair */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'activitypub-like:' || ${postId} || ':' || ${remoteActorId}, 0
    ))
  `)
  const { rows } = await query<{
    id: string
    post_id: string
  }>(sql`/* findActivityPubLikeIdentity */
    SELECT id, post_id FROM activitypub_post_likes
    WHERE like_activitypub_id = ${likeApId} AND remote_actor_id = ${remoteActorId} LIMIT 1
  `)
  if (rows[0]) {
    if (rows[0].post_id === postId) {
      await query(sql`/* confirmActivityPubLikeIdentity */
        UPDATE activitypub_post_likes SET confirmed_at = clock_timestamp()
        WHERE id = ${rows[0].id} AND confirmed_at IS NULL
      `)
    }
    return
  }

  // A different live Like id replaces the actor's prior cycle without overwriting its identity.
  await query(sql`/* retireReplacedActivityPubLike */
    UPDATE activitypub_post_likes SET deleted_at = clock_timestamp()
    WHERE post_id = ${postId} AND remote_actor_id = ${remoteActorId}
      AND deleted_at IS NULL
  `)
  await query(sql`/* insertActivityPubLikeCycle */
    INSERT INTO activitypub_post_likes (post_id, remote_actor_id, like_activitypub_id)
    VALUES (${postId}, ${remoteActorId}, ${likeApId})
    ON CONFLICT (remote_actor_id, like_activitypub_id) DO NOTHING
  `)
}
