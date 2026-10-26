import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import { prepareActivityDistributionPage } from '../services/activitypub-delivery/distribution-progress.mts'
import type { FederationRetentionFixtureIds } from './federation-retention.mts'

/** Old rows outside a scoped sweep must survive even while owned rows are deleted. */
export async function insertFederationReplayDecoysForTest(
  query: TransactionQuery,
  sourceUserId: string,
  now: Date,
): Promise<{ inboxId: string; outboundId: string }> {
  const oldAt = new Date(now.getTime() - 400 * 86_400_000)
  const inboxId = v7({ msecs: oldAt.getTime() })
  const outboundId = v7({ msecs: oldAt.getTime() })
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
  await query(
    `/* insertFederationReplayOutboundDecoyForTest */
     INSERT INTO activitypub_distribution_work_items (activity_id, source_user_id, completed_at)
     VALUES ($1::uuid, $2::uuid, $3)`,
    [outboundId, sourceUserId, oldAt],
  )
  return { inboxId, outboundId }
}

export async function countFederationReplayDecoysForTest(
  query: TransactionQuery,
  ids: { inboxId: string; outboundId: string },
): Promise<{ inbox: number; outbound: number }> {
  const inbox = await query(
    `/* countFederationReplayInboxDecoyForTest */
     SELECT 1 FROM activitypub_inbox_activities WHERE id = $1::uuid`,
    [ids.inboxId],
  )
  const outbound = await query(
    `/* countFederationReplayOutboundDecoyForTest */
     SELECT 1 FROM activitypub_distribution_work_items WHERE activity_id = $1::uuid`,
    [ids.outboundId],
  )
  return { inbox: inbox.rows.length, outbound: outbound.rows.length }
}

export async function prepareFederationDistributionReplayForTest(
  activityId: string,
  sourceUserId: string,
) {
  return prepareActivityDistributionPage(activityId, sourceUserId, {
    listRemoteFollowerInboxPage: async () => {
      throw new Error('A completed distribution replay must not load follower pages')
    },
  })
}

export async function prepareFederationDistributionPageForTest(
  activityId: string,
  sourceUserId: string,
  query: TransactionQuery,
) {
  return prepareActivityDistributionPage(activityId, sourceUserId, {
    listRemoteFollowerInboxPage: async () => [],
    query,
  })
}

export async function insertCompletedFederationReplayForTest(
  query: TransactionQuery,
  input: { activityId: string; sourceUserId: string; completedAt: Date },
): Promise<void> {
  await query(
    `/* insertCompletedFederationReplayForTest */
     INSERT INTO activitypub_distribution_work_items (activity_id, source_user_id, completed_at)
     VALUES ($1::uuid, $2::uuid, $3)`,
    [input.activityId, input.sourceUserId, input.completedAt],
  )
}

export async function readFederationReplayFloorForTest(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
): Promise<Date | null> {
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* readFederationReplayFloorForTest */
     SELECT rejection_floor_at FROM activitypub_replay_rejection_floors
     WHERE is_outbound = $1`,
    [kind === 'outbound'],
  )
  return rows[0]?.rejection_floor_at ?? null
}

export async function advanceFederationReplayFloorForTest(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
  floorAt: Date,
): Promise<void> {
  await query(
    `/* ensureFederationReplayFloorForTest */
     INSERT INTO activitypub_replay_rejection_floors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [kind === 'outbound'],
  )
  await query(
    `/* advanceFederationReplayFloorForTest */
     UPDATE activitypub_replay_rejection_floors
     SET rejection_floor_at = GREATEST(
       COALESCE(rejection_floor_at, '-infinity'::timestamptz), $2::timestamptz
     ) WHERE is_outbound = $1`,
    [kind === 'outbound', floorAt],
  )
}

export async function ensureFederationReplayFloorForTest(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
): Promise<void> {
  await query(
    `/* ensureFederationReplayFloorForTest */
     INSERT INTO activitypub_replay_rejection_floors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [kind === 'outbound'],
  )
}

/** Probe an already-held rejection-floor lock from another transaction without waiting. */
export async function isReplayFloorLockedForTest(kind: 'inbox' | 'outbound'): Promise<boolean> {
  await using query = await beginTransaction()
  try {
    await query(
      `/* isReplayFloorLockedForTest */
       SELECT rejection_floor_at FROM activitypub_replay_rejection_floors
       WHERE is_outbound = $1 FOR UPDATE NOWAIT`,
      [kind === 'outbound'],
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
