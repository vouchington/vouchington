import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Actor-bound Undo assertions never claim global ownership of an unconfirmed URI.
export async function matchesConfirmedRemoteFollowActivityIdentity(
  query: QueryExecutor,
  activityId: string,
  remoteActorId: string,
  targetUserId: string,
): Promise<boolean> {
  const { rows } = await query<{ remote_actor_identity_id: string; target_user_id: string }>(
    sql`/* findConfirmedRemoteFollowActivityOwner */
      SELECT remote_actor_identity_id, target_user_id
      FROM activitypub_remote_follow_activities
      WHERE activity_id = ${activityId} AND confirmed_at IS NOT NULL
      LIMIT 1
    `,
  )
  const owner = rows[0]
  return (
    !owner ||
    (owner.remote_actor_identity_id === remoteActorId && owner.target_user_id === targetUserId)
  )
}
