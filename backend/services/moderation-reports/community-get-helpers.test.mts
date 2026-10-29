import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestSystemModerationReport,
  setTestBanEvasionFlag,
  softDeleteUser,
} from '@voucha/test-helpers'
import { fetchBanEvasionReports } from './community-get-helpers.mts'
import type { ModerationReportSort } from './sort-sql.mts'

describe('fetchBanEvasionReports', () => {
  it('does not project a deleted suspect username into a ban-evasion report', async () => {
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: owner.id,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      undefined,
      undefined,
      community.id,
    )
    await softDeleteUser(suspect.id)

    const rows = await fetchBanEvasionReports(community.id, 5)
    const report = rows.find(row => row.id === reportId)
    expect(report).toMatchObject({
      target_available: false,
      target_label: 'user',
      target_path: null,
      admin_action_path: null,
    })
    expect(JSON.stringify(report)).not.toContain(suspect.username)
  })

  it('omits routes for an extant ban-evasion suspect without a username', async () => {
    const owner = await createTestUser()
    const suspect = await createTestUser({ noUsername: true })
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: owner.id,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      undefined,
      undefined,
      community.id,
    )

    const rows = await fetchBanEvasionReports(community.id, 5)
    expect(rows.find(row => row.id === reportId)).toMatchObject({
      target_available: true,
      target_path: null,
      admin_action_path: null,
    })
  })

  it('rejects an unknown runtime sort with and without a cursor', async () => {
    const sort = 'unknown' as ModerationReportSort
    await expect(fetchBanEvasionReports(randomUUID(), 5, sort)).rejects.toThrow(
      'Unknown moderation report sort',
    )
    await expect(
      fetchBanEvasionReports(randomUUID(), 5, sort, { id: randomUUID() }),
    ).rejects.toThrow('Unknown moderation report sort')
  })

  const sorts: Array<ModerationReportSort | undefined> = [
    undefined,
    'severity',
    'most_reported',
    'created_at_desc',
    'created_at_asc',
  ]

  it.each(sorts)('runs the keyset page query for sort %s with and without a cursor', async sort => {
    const communityId = randomUUID()

    await expect(fetchBanEvasionReports(communityId, 5, sort)).resolves.toEqual([])
    await expect(
      fetchBanEvasionReports(communityId, 5, sort, {
        id: randomUUID(),
        reportCount: 1,
        severityRank: 1,
      }),
    ).resolves.toEqual([])
  })
})
