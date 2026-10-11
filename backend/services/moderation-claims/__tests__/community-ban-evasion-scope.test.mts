import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getTestSystemModerationReportStatus,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestSystemModerationReport,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import { listCommunityPendingModerationReports } from '@services/moderation-claims/community-pending-reports'

describe('community ban-evasion report scope', () => {
  it('keeps each community queue and system-report lookup on its own report', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const source = await createTestUser()
    const [communityA, communityB] = await Promise.all([
      insertTestCommunity({
        createdById: owner.id,
        name: `Ban evasion scope A ${suffix}`,
        slug: `ban-evasion-scope-a-${suffix}`,
      }),
      insertTestCommunity({
        createdById: owner.id,
        name: `Ban evasion scope B ${suffix}`,
        slug: `ban-evasion-scope-b-${suffix}`,
      }),
    ])
    await Promise.all([
      insertTestCommunityMember({ communityId: communityA.id, userId: suspect.id }),
      insertTestCommunityMember({ communityId: communityB.id, userId: suspect.id }),
    ])
    await Promise.all([
      setTestBanEvasionFlag({
        communityId: communityA.id,
        userId: suspect.id,
        sourceUserId: source.id,
        score: 0.7,
      }),
      setTestBanEvasionFlag({
        communityId: communityB.id,
        userId: suspect.id,
        sourceUserId: source.id,
        score: 0.9,
      }),
    ])

    const reportA = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
      undefined,
      communityA.id,
    )
    const reportB = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
      undefined,
      communityB.id,
    )
    const reportAAgain = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
      undefined,
      communityA.id,
    )

    expect(reportA).not.toBe(reportB)
    expect(reportAAgain).toBe(reportA)
    expect(await getTestSystemModerationReportStatus('user', suspect.id, communityA.id)).toBe(
      'pending',
    )
    expect(await getTestSystemModerationReportStatus('user', suspect.id, communityB.id)).toBe(
      'pending',
    )

    const [queueA, queueB] = await Promise.all([
      listCommunityPendingModerationReports({ communityId: communityA.id }),
      listCommunityPendingModerationReports({ communityId: communityB.id }),
    ])

    expect(queueA.reports.map(report => report.id)).toEqual([reportA])
    expect(queueB.reports.map(report => report.id)).toEqual([reportB])
    expect(queueA.reports[0]!.community_ban_evasion?.community_id).toBe(communityA.id)
    expect(queueA.reports[0]!.community_ban_evasion?.score).toBeCloseTo(0.7, 5)
    expect(queueB.reports[0]!.community_ban_evasion?.community_id).toBe(communityB.id)
    expect(queueB.reports[0]!.community_ban_evasion?.score).toBeCloseTo(0.9, 5)
  })

  it('rejects a ban-evasion report whose community does not exist', async () => {
    const suspect = await createTestUser()
    await expect(
      insertTestSystemModerationReport(
        'user',
        suspect.id,
        'Suspected ban evasion',
        undefined,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
