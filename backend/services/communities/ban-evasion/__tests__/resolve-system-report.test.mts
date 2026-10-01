import { describe, expect, it } from 'vitest'
import {
  createSystemUser,
  createTestUser,
  getModeratorActionRowsForTest,
  getTestModerationReportStatus,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
} from '@voucha/test-helpers'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { resolveBanEvasionSystemReports } from '../resolve-system-report.mts'

describe('resolveBanEvasionSystemReports', () => {
  it('does not write moderator actions when there are no pending system reports', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })

    await resolveBanEvasionSystemReports(owner!.id, community.id, member!.id, 'dismissed')

    const actions = await getModeratorActionRowsForTest({
      actorId: owner!.id,
      communityId: community.id,
    })
    expect(actions).toEqual([])
  })

  it('resolves only the ban-evasion report stamped for the acting community', async () => {
    const [actor, suspect] = await Promise.all([createTestUser(), createTestUser()])
    const [communityA, communityB, systemUser] = await Promise.all([
      insertTestCommunity({ createdById: actor!.id, visibility: 'public' }),
      insertTestCommunity({ createdById: actor!.id, visibility: 'public' }),
      createSystemUser(BAN_EVASION_SYSTEM_USERNAME),
    ])
    const reportId = await insertTestModerationReport({
      reporterUserId: systemUser.id,
      entityType: 'user',
      entityId: suspect!.id,
      reason: 'other',
      note: 'Suspected ban evasion',
      communityId: communityA.id,
    })

    await resolveBanEvasionSystemReports(actor!.id, communityB.id, suspect!.id, 'dismissed')

    await expect(getTestModerationReportStatus(reportId)).resolves.toBe('pending')
    await expect(
      getModeratorActionRowsForTest({ actorId: actor!.id, communityId: communityB.id }),
    ).resolves.toEqual([])

    await resolveBanEvasionSystemReports(actor!.id, communityA.id, suspect!.id, 'dismissed')

    await expect(getTestModerationReportStatus(reportId)).resolves.toBe('dismissed')
    await expect(
      getModeratorActionRowsForTest({ actorId: actor!.id, communityId: communityA.id }),
    ).resolves.toContainEqual(
      expect.objectContaining({
        action_type: 'dismiss_report',
        report_id: reportId,
      }),
    )
  })
})
