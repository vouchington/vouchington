import assert from 'node:assert/strict'
import { getActiveCommunityBan, getCommunityBanDetail } from '@services/communities/bans/get'
import { listActiveCommunityBans, searchCommunityBans } from '@services/communities/bans/search'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { runCommunityBanLiftScenarios } from './community-ban-lifts.mts'
import {
  BAN_ACTIVE_COUNT,
  BAN_BULK_COUNT,
  BAN_EMPTY_USER_ID,
  BAN_EXPIRED_COUNT,
  BAN_HISTORY_NOISE_COUNT,
  BAN_PAGE_COMMUNITY_ID,
  BAN_PAGE_USER_ID,
} from '../seed-data/community-ban-pages.mts'
import { seedUuid } from '../seed-data/common.mts'

const firstActiveId = seedUuid(BAN_EXPIRED_COUNT, '29')
const banRows = BAN_EXPIRED_COUNT + BAN_ACTIVE_COUNT + BAN_HISTORY_NOISE_COUNT + BAN_BULK_COUNT

export async function runCommunityBanPageScenarios(): Promise<void> {
  registerScenarioContract('community-bans-active-empty', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_bans__active_expiry', 'idx_community_bans__user_id'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 2 },
    ],
    seededRows: { community_bans: banRows },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'community-bans-active-empty',
    async () => {
      const page = await listActiveCommunityBans(BAN_PAGE_COMMUNITY_ID, BAN_EMPTY_USER_ID, {
        limit: 2,
      })
      assert.equal(page.results.length, 0)
    },
    undefined,
    'listActiveCommunityBans',
  )

  registerScenarioContract('community-bans-active-first', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_bans__active_expiry'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 4 },
    ],
    seededRows: { community_bans: banRows },
  })
  let cursor: string | null = null
  let firstIds: string[] = []
  await runAndCapture(
    'community-bans-active-first',
    async () => {
      const page = await listActiveCommunityBans(BAN_PAGE_COMMUNITY_ID, BAN_PAGE_USER_ID, {
        limit: 2,
      })
      assert.equal(page.results.length, 2)
      firstIds = page.results.map(ban => ban.id)
      cursor = page.page_info.end_cursor
      assert.ok(cursor)
    },
    undefined,
    'listActiveCommunityBans',
  )

  registerScenarioContract('community-bans-active-continuation', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_bans__active_expiry'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 4 },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-active-continuation',
    async () => {
      const page = await listActiveCommunityBans(BAN_PAGE_COMMUNITY_ID, BAN_PAGE_USER_ID, {
        limit: 2,
        after: cursor!,
      })
      assert.equal(page.results.length, 2)
      assert.ok(page.results.every(ban => !firstIds.includes(ban.id)))
    },
    undefined,
    'listActiveCommunityBans',
  )

  registerScenarioContract('community-bans-detail-by-id', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['community_bans_pkey', 'idx_community_bans__community_id_id'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 2 },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-detail-by-id',
    async () => {
      const ban = await getCommunityBanDetail(BAN_PAGE_COMMUNITY_ID, firstActiveId)
      assert.equal(ban?.id, firstActiveId)
    },
    undefined,
    'getCommunityBanDetail',
  )

  await runCommunityBanLiftScenarios()

  registerScenarioContract('community-bans-newest-active', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_bans__community_id_id', 'idx_community_bans__active_expiry'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: BAN_ACTIVE_COUNT + 2 },
    ],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-newest-active',
    async () => {
      const ban = await getActiveCommunityBan(BAN_PAGE_COMMUNITY_ID, BAN_PAGE_USER_ID)
      assert.ok(ban)
    },
    undefined,
    'getActiveCommunityBan',
  )

  registerScenarioContract('community-bans-history-summary', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'community_bans', max: 30 }],
    seededRows: { community_bans: banRows },
  })
  await runAndCapture(
    'community-bans-history-summary',
    async () => {
      const page = await searchCommunityBans(BAN_PAGE_COMMUNITY_ID, { limit: 20 })
      assert.equal(page.results.length, 20)
      assert.equal('reason' in page.results[0]!, false)
    },
    undefined,
    'searchCommunityBans',
  )
}
