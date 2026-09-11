import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
  getTestBanEvasionFlagState,
  insertTestSystemModerationReport,
  getTestSystemModerationReportStatus,
  getModeratorActionRowsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { dismissBanEvasionFlag } from '../dismiss.mts'

describe('dismissBanEvasionFlag', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('clears the flag and resolves the system report as dismissed', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: member.id,
      sourceUserId: owner.id,
      score: 0.7,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      member.id,
      'Suspected ban evasion',
    )

    await dismissBanEvasionFlag(owner, community.id, member.id)

    const flagState = await getTestBanEvasionFlagState(community.id, member.id)
    expect(flagState?.suspected_ban_evader_dismissed_at).not.toBeNull()
    expect(flagState?.suspected_ban_evader_dismissed_by_id).toBe(owner.id)

    const reportStatus = await getTestSystemModerationReportStatus('user', member.id)
    expect(reportStatus).toBe('dismissed')

    const actions = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    expect(actions).toContainEqual(
      expect.objectContaining({
        action_type: 'dismiss_report',
        report_id: reportId,
      }),
    )
  })

  it('throws 403 when caller is not a moderator', async () => {
    const outsider = await createTestUser()
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(dismissBanEvasionFlag(outsider, community.id, member.id)).rejects.toMatchObject({
      status: 403,
    })
  })
})
