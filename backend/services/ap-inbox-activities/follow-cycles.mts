import { assertRemoteActivityHost } from '@modules/activitypub-uris'
import { write, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { matchesConfirmedRemoteFollowActivityIdentity } from './follow-activity-identity.mts'

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
  return withTransactionOptions(options, async run => {
    if (
      !(await matchesConfirmedRemoteFollowActivityIdentity(
        run,
        activityId,
        remoteActorId,
        targetUserId,
      ))
    ) {
      throw new Error('ActivityPub Follow id belongs to another actor or target')
    }
    const { rows: inserted } = await run<
      Pick<FollowCycle, 'id' | 'undone_at'>
    >(sql`/* reserveRemoteFollowCycle */
    INSERT INTO activitypub_remote_follow_activities (activity_id, remote_actor_identity_id, target_user_id)
    SELECT ${activityId}, actor.id, target.id
    FROM remote_actors actor
    JOIN users target ON target.id = ${targetUserId} AND target.deleted_at IS NULL
    WHERE actor.id = ${remoteActorId} AND actor.deleted_at IS NULL
    ON CONFLICT (remote_actor_identity_id, activity_id) DO NOTHING
    RETURNING id, undone_at
  `)
    if (inserted[0]) return { id: inserted[0].id, isNew: true, isUndone: false }
    const confirmed = await run<FollowCycle>(sql`/* confirmRemoteFollowActivity */
    UPDATE activitypub_remote_follow_activities SET confirmed_at = clock_timestamp()
    WHERE activity_id = ${activityId} AND remote_actor_identity_id = ${remoteActorId}
      AND target_user_id = ${targetUserId} AND confirmed_at IS NULL
    RETURNING id, undone_at, remote_actor_identity_id, target_user_id
  `)
    const { rows } = confirmed.rows.length
      ? confirmed
      : await run<FollowCycle>(sql`/* readRemoteFollowCycle */
    SELECT id, undone_at, remote_actor_identity_id, target_user_id
    FROM activitypub_remote_follow_activities
    WHERE activity_id = ${activityId} AND remote_actor_identity_id = ${remoteActorId}
    LIMIT 1
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
  }).catch((err: unknown) => {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === '23505' &&
      'constraint' in err &&
      err.constraint === 'idx_activitypub_remote_follow_activities__confirmed_activity'
    )
      throw new Error('ActivityPub Follow id belongs to another actor or target', { cause: err })
    throw err
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
    if (
      !(await matchesConfirmedRemoteFollowActivityIdentity(
        run,
        activityId,
        remoteActorId,
        targetUserId,
      ))
    )
      return null
    const { rows } = await run<{ id: string }>(sql`/* markRemoteFollowUndone */
    INSERT INTO activitypub_remote_follow_activities
      (activity_id, remote_actor_identity_id, target_user_id, undone_at, confirmed_at)
    SELECT ${activityId}, actor.id, target.id, clock_timestamp(), NULL
    FROM remote_actors actor
    JOIN users target ON target.id = ${targetUserId} AND target.deleted_at IS NULL
    WHERE actor.id = ${remoteActorId} AND actor.deleted_at IS NULL
    ON CONFLICT (remote_actor_identity_id, activity_id) DO UPDATE
      SET undone_at = COALESCE(activitypub_remote_follow_activities.undone_at, EXCLUDED.undone_at)
      WHERE activitypub_remote_follow_activities.remote_actor_identity_id = EXCLUDED.remote_actor_identity_id
        AND activitypub_remote_follow_activities.target_user_id = EXCLUDED.target_user_id
    RETURNING id
  `)
    return rows[0]?.id ?? null
  })
}

export async function readRemoteFollowCyclePointer(
  remoteActorId: string,
  targetUserId: string,
  options: QueryOptions,
): Promise<string | null> {
  const run = options.query ?? write
  const { rows } = await run<{
    inbound_follow_activity_row_id: string | null
  }>(sql`/* readRemoteFollowCyclePointer */
    SELECT inbound_follow_activity_row_id FROM relation__remote_actor__follow__user
    WHERE subject_id = ${remoteActorId} AND object_id = ${targetUserId}
    LIMIT 1
  `)
  return rows[0]?.inbound_follow_activity_row_id ?? null
}

export async function retireRemoteFollowCycle(
  cycleId: string,
  options: QueryOptions,
): Promise<void> {
  const run = options.query ?? write
  await run(sql`/* retireRemoteFollowCycle */ UPDATE activitypub_remote_follow_activities
    SET undone_at = clock_timestamp() WHERE id = ${cycleId}::uuid AND undone_at IS NULL`)
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
