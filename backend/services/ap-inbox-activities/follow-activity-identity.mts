import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

// An Undo asserts only its sender's cycle. Receipt of the original Follow establishes
// the global URI owner. Take this fence before any actor/target pair lock.
export async function lockRemoteFollowActivityIdentity(
  query: QueryExecutor,
  activityId: string,
  remoteActorId: string,
  targetUserId: string,
): Promise<boolean> {
  await query(sql`/* lockRemoteFollowActivityIdentity */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'activitypub-follow-identity:' || ${activityId}, 0
    ))
  `)
  const { rows } = await query<{ remote_actor_id: string; target_user_id: string }>(
    sql`/* findConfirmedRemoteFollowActivityOwner */
      SELECT remote_actor_id, target_user_id
      FROM activitypub_remote_follow_activities
      WHERE activity_id = ${activityId} AND confirmed_at IS NOT NULL
      LIMIT 1
    `,
  )
  const owner = rows[0]
  return (
    !owner || (owner.remote_actor_id === remoteActorId && owner.target_user_id === targetUserId)
  )
}
