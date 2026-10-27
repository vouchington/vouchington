import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import type { FederationRetentionFixtureIds } from './federation-retention.mts'

/** Old rows outside a scoped sweep must survive even while owned rows are deleted. */
export async function insertFederationReplayDecoyForTest(
  query: TransactionQuery,
  now: Date,
): Promise<string> {
  const oldAt = new Date(now.getTime() - 400 * 86_400_000)
  const inboxId = v7({ msecs: oldAt.getTime() })
  await query(
    `/* insertFederationReplayInboxDecoyForTest */
     INSERT INTO activitypub_inbox_activities (id, activity_id, activity_type, actor_uri, received_at)
     VALUES ($1::uuid, $2, 'Follow', $3, $4)`,
    [
      inboxId,
      `https://retention-test.invalid/activity/decoy/${inboxId}`,
      'https://retention-test.invalid/actor',
      oldAt,
    ],
  )
  return inboxId
}

export async function countFederationReplayDecoyForTest(
  query: TransactionQuery,
  inboxId: string,
): Promise<number> {
  const inbox = await query(
    `/* countFederationReplayInboxDecoyForTest */
     SELECT 1 FROM activitypub_inbox_activities WHERE id = $1::uuid`,
    [inboxId],
  )
  return inbox.rows.length
}

export async function insertFederationInboxReplayForTest(
  query: TransactionQuery,
  input: { id: string; receivedAt: Date },
): Promise<void> {
  await query(
    `/* insertFederationInboxReplayForTest */
     INSERT INTO activitypub_inbox_activities (id, activity_id, activity_type, actor_uri, received_at)
     VALUES ($1::uuid, $2, 'Follow', $3, $4)`,
    [
      input.id,
      `https://retention-test.invalid/activity/${input.id}`,
      'https://retention-test.invalid/actor',
      input.receivedAt,
    ],
  )
}

export async function readFederationReplayFloorForTest(
  query: TransactionQuery,
): Promise<Date | null> {
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* readFederationReplayFloorForTest */
     SELECT rejection_floor_at FROM activitypub_replay_rejection_floors`,
  )
  return rows[0]?.rejection_floor_at ?? null
}

export async function advanceFederationReplayFloorForTest(
  query: TransactionQuery,
  floorAt: Date,
): Promise<void> {
  await ensureFederationReplayFloorForTest(query)
  await query(
    `/* advanceFederationReplayFloorForTest */
     UPDATE activitypub_replay_rejection_floors
     SET rejection_floor_at = GREATEST(
       COALESCE(rejection_floor_at, '-infinity'::timestamptz), $1::timestamptz
     )`,
    [floorAt],
  )
}

export async function ensureFederationReplayFloorForTest(query: TransactionQuery): Promise<void> {
  await query(
    `/* ensureFederationReplayFloorForTest */
     INSERT INTO activitypub_replay_rejection_floors DEFAULT VALUES
     ON CONFLICT (is_singleton) DO NOTHING`,
  )
}

/** Probe an already-held rejection-floor lock from another transaction without waiting. */
export async function isReplayFloorLockedForTest(): Promise<boolean> {
  await using query = await beginTransaction()
  try {
    await query(
      `/* isReplayFloorLockedForTest */
       SELECT rejection_floor_at FROM activitypub_replay_rejection_floors FOR UPDATE NOWAIT`,
    )
    return false
  } catch (err) {
    if ((err as { code?: string }).code === '55P03') return true
    throw err
  }
}

export async function deleteFederationInboxFixturesForTest(
  query: TransactionQuery,
  ids: FederationRetentionFixtureIds,
): Promise<void> {
  await query(
    `/* deleteOwnedFederationInboxFixturesForTest */
     DELETE FROM activitypub_inbox_activities WHERE id = ANY($1::uuid[])`,
    [[...ids.expiredInboxActivityIds, ids.currentInboxActivityId]],
  )
}

export async function deleteFederationInboxActivityForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<void> {
  await query(
    `/* deleteFederationInboxActivityForTest */
     DELETE FROM activitypub_inbox_activities WHERE activity_id = $1`,
    [activityId],
  )
}
