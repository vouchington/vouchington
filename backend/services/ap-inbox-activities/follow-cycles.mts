import { assertRemoteActivityHost } from '@modules/activitypub-uris'
import {
  write,
  withTransactionOptions,
  type QueryOptions,
  type QueryExecutor,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockRemoteFollowActivityIdentity } from './follow-activity-identity.mts'

type FollowCycle = {
  id: string
  undone_at: Date | null
  remote_actor_id: string
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
  return withTransactionOptions(options, async run => {
    if (!(await lockRemoteFollowActivityIdentity(run, activityId, remoteActorId, targetUserId))) {
      throw new Error('ActivityPub Follow id belongs to another actor or target')
    }
    await lockRemoteFollowPair(run, remoteActorId, targetUserId)
    const { rows: inserted } = await run<
      Pick<FollowCycle, 'id' | 'undone_at'>
    >(sql`/* reserveRemoteFollowCycle */
    INSERT INTO activitypub_remote_follow_activities (activity_id, remote_actor_id, target_user_id)
    VALUES (${activityId}, ${remoteActorId}, ${targetUserId})
    ON CONFLICT (remote_actor_id, activity_id) DO NOTHING
    RETURNING id, undone_at
  `)
    if (inserted[0]) return { id: inserted[0].id, isNew: true, isUndone: false }
    const { rows } = await run<FollowCycle>(sql`/* readRemoteFollowCycle */
    SELECT id, undone_at, remote_actor_id, target_user_id
    FROM activitypub_remote_follow_activities
    WHERE activity_id = ${activityId} AND remote_actor_id = ${remoteActorId}
    LIMIT 1
    FOR UPDATE
  `)
    const cycle = rows[0]
    if (
      !cycle ||
      cycle.remote_actor_id !== remoteActorId ||
      cycle.target_user_id !== targetUserId
    ) {
      throw new Error('ActivityPub Follow id belongs to another actor or target')
    }
    await run(sql`/* confirmRemoteFollowActivity */
    UPDATE activitypub_remote_follow_activities SET confirmed_at = clock_timestamp()
    WHERE id = ${cycle.id} AND confirmed_at IS NULL
  `)
    return { id: cycle.id, isNew: false, isUndone: cycle.undone_at !== null }
  })
}

export async function markRemoteFollowUndone(
  activityId: string,
  remoteActor: { id: string; actor_uri: string },
  targetUserId: string,
  options: QueryOptions,
): Promise<string | null> {
  assertRemoteActivityHost(activityId, remoteActor.actor_uri)
  const remoteActorId = remoteActor.id
  return withTransactionOptions(options, async run => {
    if (!(await lockRemoteFollowActivityIdentity(run, activityId, remoteActorId, targetUserId)))
      return null
    await lockRemoteFollowPair(run, remoteActorId, targetUserId)
    const { rows } = await run<{ id: string }>(sql`/* markRemoteFollowUndone */
    INSERT INTO activitypub_remote_follow_activities
      (activity_id, remote_actor_id, target_user_id, undone_at, confirmed_at)
    VALUES (${activityId}, ${remoteActorId}, ${targetUserId}, clock_timestamp(), NULL)
    ON CONFLICT (remote_actor_id, activity_id) DO UPDATE
      SET undone_at = COALESCE(activitypub_remote_follow_activities.undone_at, EXCLUDED.undone_at)
      WHERE activitypub_remote_follow_activities.remote_actor_id = EXCLUDED.remote_actor_id
        AND activitypub_remote_follow_activities.target_user_id = EXCLUDED.target_user_id
    RETURNING id
  `)
    return rows[0]?.id ?? null
  })
}

export async function setCurrentRemoteFollowCycle(
  remoteActorId: string,
  targetUserId: string,
  cycleId: string,
  options: QueryOptions,
): Promise<void> {
  const run = options.query ?? write
  await run(sql`/* retireReplacedRemoteFollowCycle */
    UPDATE activitypub_remote_follow_activities
    SET undone_at = COALESCE(undone_at, clock_timestamp())
    WHERE id = (
      SELECT inbound_follow_activity_row_id FROM relation__remote_actor__follow__user
      WHERE subject_id = ${remoteActorId} AND object_id = ${targetUserId}
        AND deleted_at IS NULL
      LIMIT 1
    ) AND id <> ${cycleId}
  `)
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

async function lockRemoteFollowPair(
  query: QueryExecutor,
  remoteActorId: string,
  targetUserId: string,
): Promise<void> {
  await query(sql`/* lockRemoteFollowPair */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'activitypub-follow:' || ${remoteActorId} || ':' || ${targetUserId}, 0
    ))
  `)
}
