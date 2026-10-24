import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

type FollowCycle = {
  id: string
  undone_at: Date | null
  remote_actor_identity_id: string
  target_user_id: string
}

// An activity id is immutable even if the short-lived inbox dedup row is gone. The first
// successful Follow creates its cycle; an earlier Undo may already have created its tombstone.
export async function reserveRemoteFollowCycle(
  activityId: string,
  remoteActorId: string,
  targetUserId: string,
  options: QueryOptions,
): Promise<{ id: string; isNew: boolean; isUndone: boolean }> {
  const run = options.query ?? write
  const { rows: inserted } = await run<
    Pick<FollowCycle, 'id' | 'undone_at'>
  >(sql`/* reserveRemoteFollowCycle */
    INSERT INTO activitypub_remote_follow_activities (activity_id, remote_actor_identity_id, target_user_id)
    SELECT ${activityId}, actor.id, target.id
    FROM remote_actors actor
    JOIN users target ON target.id = ${targetUserId} AND target.deleted_at IS NULL
    WHERE actor.id = ${remoteActorId} AND actor.deleted_at IS NULL
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING id, undone_at
  `)
  if (inserted[0]) return { id: inserted[0].id, isNew: true, isUndone: false }
  const { rows } = await run<FollowCycle>(sql`/* readRemoteFollowCycle */
    SELECT id, undone_at, remote_actor_identity_id, target_user_id
    FROM activitypub_remote_follow_activities
    WHERE activity_id = ${activityId}
    LIMIT 1
    FOR UPDATE
  `)
  const cycle = rows[0]
  if (
    !cycle ||
    cycle.remote_actor_identity_id !== remoteActorId ||
    cycle.target_user_id !== targetUserId
  ) {
    throw new Error('ActivityPub Follow id belongs to another actor or target')
  }
  return { id: cycle.id, isNew: false, isUndone: cycle.undone_at !== null }
}

export async function markRemoteFollowUndone(
  activityId: string,
  remoteActorId: string,
  targetUserId: string,
  options: QueryOptions,
): Promise<string | null> {
  const run = options.query ?? write
  const { rows } = await run<{ id: string }>(sql`/* markRemoteFollowUndone */
    INSERT INTO activitypub_remote_follow_activities
      (activity_id, remote_actor_identity_id, target_user_id, undone_at)
    SELECT ${activityId}, actor.id, target.id, clock_timestamp()
    FROM remote_actors actor
    JOIN users target ON target.id = ${targetUserId} AND target.deleted_at IS NULL
    WHERE actor.id = ${remoteActorId} AND actor.deleted_at IS NULL
    ON CONFLICT (activity_id) DO UPDATE
      SET undone_at = COALESCE(activitypub_remote_follow_activities.undone_at, EXCLUDED.undone_at)
      WHERE activitypub_remote_follow_activities.remote_actor_identity_id = EXCLUDED.remote_actor_identity_id
        AND activitypub_remote_follow_activities.target_user_id = EXCLUDED.target_user_id
    RETURNING id
  `)
  return rows[0]?.id ?? null
}

export async function setCurrentRemoteFollowCycle(
  remoteActorId: string,
  targetUserId: string,
  cycleId: string,
  options: QueryOptions,
): Promise<void> {
  const run = options.query ?? write
  await run(sql`/* setCurrentRemoteFollowCycle */
    UPDATE relation__remote_actor__follow__user
    SET inbound_follow_activity_row_id = ${cycleId}
    WHERE subject_id = ${remoteActorId} AND object_id = ${targetUserId}
      AND deleted_at IS NULL
  `)
}

export async function isCurrentRemoteFollowCycle(
  remoteActorId: string,
  targetUserId: string,
  cycleId: string,
  options: QueryOptions,
): Promise<boolean> {
  const run = options.query ?? write
  const { rows } = await run(sql`/* isCurrentRemoteFollowCycle */
    SELECT 1 FROM relation__remote_actor__follow__user
    WHERE subject_id = ${remoteActorId} AND object_id = ${targetUserId}
      AND inbound_follow_activity_row_id = ${cycleId} AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
