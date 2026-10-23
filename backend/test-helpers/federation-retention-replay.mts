import type { TransactionQuery } from '@data-stores/psql'
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
