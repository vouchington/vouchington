import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'

export async function insertOperationalRetainedReplayAnchorsForTest(
  query: TransactionQuery,
  postId: string,
  userId: string,
): Promise<{ actorIdentityId: string; likeActivityId: string; followActivityId: string }> {
  const actorUri = `https://retention-${randomUUID()}.example/users/actor`
  const { rows } = await query<{ id: string }>(
    `/* insertOperationalReplayActorIdentityForTest */
     INSERT INTO remote_actor_identities (actor_uri) VALUES ($1) RETURNING id`,
    [actorUri],
  )
  const actorIdentityId = rows[0]!.id
  const likeActivityId = `${actorUri}/likes/${randomUUID()}`
  const followActivityId = `${actorUri}/follows/${randomUUID()}`
  await query(
    `/* insertOperationalRetainedLikeActivityForTest */
     INSERT INTO activitypub_post_like_activities
       (activity_id, post_id, remote_actor_identity_id, undone_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [likeActivityId, postId, actorIdentityId],
  )
  await query(
    `/* insertOperationalRetainedFollowActivityForTest */
     INSERT INTO activitypub_remote_follow_activities
       (activity_id, remote_actor_identity_id, target_user_id, undone_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [followActivityId, actorIdentityId, userId],
  )
  return { actorIdentityId, likeActivityId, followActivityId }
}

export async function deleteOperationalRetainedReplayAnchorsForTest(
  query: TransactionQuery,
  anchors: { actorIdentityId: string; likeActivityId: string; followActivityId: string },
): Promise<void> {
  await deleteOperationalRetainedReplayReferencesForTest(query, anchors)
  await query(
    `/* deleteOperationalReplayActorIdentityForTest */
     DELETE FROM remote_actor_identities WHERE id = $1`,
    [anchors.actorIdentityId],
  )
}

export async function deleteOperationalRetainedReplayReferencesForTest(
  query: TransactionQuery,
  anchors: { likeActivityId: string; followActivityId: string },
): Promise<void> {
  await deleteOperationalRetainedLikeReferenceForTest(query, anchors.likeActivityId)
  await deleteOperationalRetainedFollowReferenceForTest(query, anchors.followActivityId)
}

export async function deleteOperationalRetainedLikeReferenceForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<void> {
  await query(
    `/* deleteOperationalRetainedLikeActivityForTest */
     DELETE FROM activitypub_post_like_activities WHERE activity_id = $1`,
    [activityId],
  )
}

export async function deleteOperationalRetainedFollowReferenceForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<void> {
  await query(
    `/* deleteOperationalRetainedFollowActivityForTest */
     DELETE FROM activitypub_remote_follow_activities WHERE activity_id = $1`,
    [activityId],
  )
}
