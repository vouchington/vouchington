import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { liftAllCommunityBans, liftCommunityBan } from '@services/communities/bans/lift'
import { getCommunitiesWorkLimit } from '@services/communities/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser, heavyFollowUser } from '../run-support.mts'
import {
  BAN_ACTIVE_COUNT,
  BAN_BULK_COUNT,
  BAN_BULK_USER_ID,
  BAN_EXPIRED_COUNT,
  BAN_HISTORY_NOISE_COUNT,
  BAN_PAGE_COMMUNITY_ID,
  BAN_PAGE_USER_ID,
} from '../seed-data/community-ban-pages.mts'
import { seedUuid } from '../seed-data/common.mts'

const firstActiveId = seedUuid(BAN_EXPIRED_COUNT, '29')
const banRows = BAN_EXPIRED_COUNT + BAN_ACTIVE_COUNT + BAN_HISTORY_NOISE_COUNT + BAN_BULK_COUNT

export async function runCommunityBanLiftScenarios(): Promise<void> {
  const cap = getCommunitiesWorkLimit('lift_all_active_ban_limit')
  registerScenarioContract('community-bans-lift-all-overflow', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_bans__active_expiry'] },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 2 * (cap + 1) },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-lift-all-overflow',
    async () => {
      await assert.rejects(
        liftAllCommunityBans(seedUser, BAN_PAGE_COMMUNITY_ID, BAN_PAGE_USER_ID),
        {
          status: 409,
          code: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
        },
      )
    },
    undefined,
    'liftSelectedCommunityBans',
  )

  registerScenarioContract('community-bans-lift-all-forbidden', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_bans__active_expiry'] },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 2 * (cap + 1) },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-lift-all-forbidden',
    async () => {
      await assert.rejects(
        liftAllCommunityBans(heavyFollowUser, BAN_PAGE_COMMUNITY_ID, BAN_BULK_USER_ID),
        {
          status: 403,
          code: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
        },
      )
    },
    undefined,
    'liftSelectedCommunityBans',
  )

  registerScenarioContract('community-bans-lift-all-at-cap', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_bans__active_expiry'] },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 4 * cap + 2 },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-lift-all-at-cap',
    async () => {
      const result = await liftAllCommunityBans(seedUser, BAN_PAGE_COMMUNITY_ID, BAN_BULK_USER_ID)
      assert.equal(result.lifted_ban_ids.length, BAN_BULK_COUNT)
    },
    undefined,
    'liftSelectedCommunityBans',
    {
      afterCapture: async () => {
        await write(
          `/* resetCommunityBanBulkLiftScenario */
        UPDATE community_bans SET lifted_at = NULL, lifted_by_id = NULL
        WHERE community_id = $1 AND user_id = $2`,
          [BAN_PAGE_COMMUNITY_ID, BAN_BULK_USER_ID],
        )
      },
    },
  )

  registerScenarioContract('community-bans-lift-single', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['community_bans_pkey'] },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 4 },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-lift-single',
    async () => {
      const result = await liftCommunityBan(seedUser, BAN_PAGE_COMMUNITY_ID, firstActiveId)
      assert.deepEqual(result.lifted_ban_ids, [firstActiveId])
    },
    undefined,
    'liftSelectedCommunityBans',
    {
      afterCapture: async () => {
        await write(
          `/* resetCommunityBanLiftScenario */
        UPDATE community_bans SET lifted_at = NULL, lifted_by_id = NULL WHERE id = $1`,
          [firstActiveId],
        )
      },
    },
  )
}
