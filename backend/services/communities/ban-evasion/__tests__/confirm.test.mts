import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  setTestBanEvasionFlag,
  getTestBanEvasionFlagState,
  getTestActiveCommunityBan,
  insertTestSystemModerationReport,
  getTestSystemModerationReportStatus,
  getModeratorActionRowsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { confirmBanEvasion } from '../confirm.mts'

describe('confirmBanEvasion', () => {
  let staff: PrivateUser
  let owner: PrivateUser
  let moderator: PrivateUser
  let community: Community

  beforeAll(async () => {
    const [s, o, m] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    staff = s!
    owner = o!
    moderator = m!
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
  })

  it('creates a ban, dismisses the flag, and resolves the system report', async () => {
    const sourceUser = await createTestUser()
    const member = await createTestUser()

    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: sourceUser.id,
      bannedById: owner.id,
    })

    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: member.id,
      sourceUserId: sourceUser.id,
      score: 0.8,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      member.id,
      'Suspected ban evasion',
    )

    await confirmBanEvasion(staff, community.id, member.id)

    const ban = await getTestActiveCommunityBan(community.id, member.id)
    expect(ban).not.toBeNull()

    const flagState = await getTestBanEvasionFlagState(community.id, member.id)
    expect(flagState?.suspected_ban_evader_dismissed_at).not.toBeNull()

    const reportStatus = await getTestSystemModerationReportStatus('user', member.id)
    expect(reportStatus).toBe('actioned')

    const actions = await getModeratorActionRowsForTest({
      actorId: staff.id,
      communityId: community.id,
    })
    expect(actions).toContainEqual(
      expect.objectContaining({
        action_type: 'resolve_report',
        report_id: reportId,
      }),
    )
  })

  it('throws 403 when caller is not site moderation staff', async () => {
    const outsider = await createTestUser()
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(confirmBanEvasion(outsider, community.id, member.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 403 when caller is only a community owner', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(confirmBanEvasion(owner, community.id, member.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 422 when no flag is active', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(confirmBanEvasion(staff, community.id, member.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('restores the flag when banUserFromCommunity fails (e.g. suspect is community owner)', async () => {
    const sourceUser = await createTestUser()
    const suspectOwner = await createTestUser()

    await insertTestCommunityMember({ communityId: community.id, userId: sourceUser.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: suspectOwner.id,
      role: 'owner',
    })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: sourceUser.id,
      bannedById: owner.id,
    })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspectOwner.id,
      sourceUserId: sourceUser.id,
      score: 0.9,
    })

    // banUserFromCommunity will reject because community owners cannot be banned
    await expect(confirmBanEvasion(staff, community.id, suspectOwner.id)).rejects.toMatchObject({
      status: 403,
    })

    // The flag should be restored (dismissed_at reset to NULL)
    const flagState = await getTestBanEvasionFlagState(community.id, suspectOwner.id)
    expect(flagState?.suspected_ban_evader_dismissed_at).toBeNull()
  })
})
