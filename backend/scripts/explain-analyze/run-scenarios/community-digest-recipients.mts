import assert from 'node:assert/strict'
import { listCommunityActivityDigestRecipientPage } from '@services/notifications/community-activity-digest-recipients'
import { getNotificationsWorkLimit } from '@services/notifications/work-limits'
import { registerScenarioContract, type ScenarioPlanContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COMMUNITY_MEMBERSHIP_CAP_USER_ID } from '../seed-data/community-membership-caps.mts'
import { withArchivedDigestMemberships } from '../seed-data/community-digest-membership-pages.mts'

export async function runCommunityDigestRecipientScenarios(): Promise<void> {
  const batchSize = getNotificationsWorkLimit('community_digest_recipient_batch_size')
  const contract: ScenarioPlanContract = {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_community_members__active_moderator_user_id',
          'users_pkey',
          'communities_pkey',
        ],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_members', max: batchSize + 1 },
      { kind: 'maxProcessedRows', relation: 'users', max: batchSize + 1 },
      { kind: 'maxProcessedRows', relation: 'communities', max: batchSize + 1 },
    ],
  }
  registerScenarioContract('community-activity-digest-recipients', contract)
  await runAndCapture('community-activity-digest-recipients', () =>
    listCommunityActivityDigestRecipientPage(),
  )
  await withArchivedDigestMemberships(async communityIds => {
    assert(
      batchSize * 2 < communityIds.length,
      'The membership fixture must contain two full pages',
    )
    let nextCommunityId: string | null = null
    registerScenarioContract('community-activity-digest-archived-first', contract)
    await runAndCapture('community-activity-digest-archived-first', async () => {
      const page = await listCommunityActivityDigestRecipientPage(
        undefined,
        COMMUNITY_MEMBERSHIP_CAP_USER_ID,
        [COMMUNITY_MEMBERSHIP_CAP_USER_ID],
        batchSize,
      )
      assert.deepEqual(page.page, [])
      assert.equal(page.hasMore, true)
      assert.equal(page.nextUserId, COMMUNITY_MEMBERSHIP_CAP_USER_ID)
      assert.equal(page.nextCommunityId, communityIds[batchSize - 1])
      nextCommunityId = page.nextCommunityId
    })
    registerScenarioContract('community-activity-digest-archived-later', contract)
    await runAndCapture('community-activity-digest-archived-later', async () => {
      const page = await listCommunityActivityDigestRecipientPage(
        COMMUNITY_MEMBERSHIP_CAP_USER_ID,
        COMMUNITY_MEMBERSHIP_CAP_USER_ID,
        [COMMUNITY_MEMBERSHIP_CAP_USER_ID],
        batchSize,
        nextCommunityId,
      )
      assert.deepEqual(page.page, [])
      assert.equal(page.hasMore, true)
      assert.equal(page.nextUserId, COMMUNITY_MEMBERSHIP_CAP_USER_ID)
      assert.equal(page.nextCommunityId, communityIds[batchSize * 2 - 1])
    })
  })
}
