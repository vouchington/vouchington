import type { TransactionQuery } from '@data-stores/psql'
import { prepareActivityDistributionPage } from '../services/activitypub-delivery/distribution-progress.mts'
import type { FederationRetentionFixtureIds } from './federation-retention.mts'

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
