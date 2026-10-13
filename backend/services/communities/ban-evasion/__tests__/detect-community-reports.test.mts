import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createReferralProgramFixture,
  createSystemUser,
  createTestUrlWithHostname,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  insertTestPost,
  insertTestUserReferralProgramLink,
  listTestPendingUserReportCommunityIds,
  setTestPostContentSha,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { detectBanEvasionForMember } from '../detect.mts'

describe('detectBanEvasionForMember community reports', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      createSystemUser(BAN_EVASION_SYSTEM_USERNAME),
    ])
  })

  it('keeps a separate pending ban-evasion report for each community', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()
    const secondCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
    })
    const communities = [community, secondCommunity]
    const { referralProgramId } = await createReferralProgramFixture({ createdById: owner.id })
    const sharedUrlId = await createTestUrlWithHostname()
    const sharedSha = randomBytes(32)
    await Promise.all([
      insertTestUserReferralProgramLink({
        userId: bannedUser.id,
        referralProgramId,
        urlId: sharedUrlId,
      }),
      insertTestUserReferralProgramLink({
        userId: member.id,
        referralProgramId,
        urlId: sharedUrlId,
      }),
    ])

    await Promise.all(
      communities.map(async (target, index) => {
        await Promise.all([
          insertTestCommunityMember({ communityId: target.id, userId: bannedUser.id }),
          insertTestCommunityMember({ communityId: target.id, userId: member.id }),
        ])
        const suffix = `${createRandomString(8)}-${index}`
        const [bannedPostId, memberPostId] = await Promise.all([
          insertTestPost({
            title: `Banned cross-community post ${suffix}`,
            slug: `banned-cross-community-${suffix}`,
            markdown: 'Copied across communities',
            createdById: bannedUser.id,
            communityId: target.id,
            postType: 'article',
          }),
          insertTestPost({
            title: `Member cross-community post ${suffix}`,
            slug: `member-cross-community-${suffix}`,
            markdown: 'Copied across communities',
            createdById: member.id,
            communityId: target.id,
            postType: 'article',
          }),
        ])
        await setTestPostContentSha([bannedPostId, memberPostId], sharedSha)
        await insertTestCommunityBan({
          communityId: target.id,
          userId: bannedUser.id,
          bannedById: owner.id,
        })
      }),
    )

    await Promise.all(
      communities.map(async target => {
        await expect(detectBanEvasionForMember(target.id, member.id)).resolves.toEqual(
          expect.objectContaining({ flagged: true, sourceUserId: bannedUser.id }),
        )
      }),
    )

    await expect(listTestPendingUserReportCommunityIds(member.id)).resolves.toEqual(
      [community.id, secondCommunity.id].toSorted(),
    )
  })
})
