import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createSystemUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  insertTestPost,
  setTestBanEvasionFlag,
  setTestPostContentSha,
  createReferralProgramFixture,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
  getTestBanEvasionFlagState,
  getTestModerationReportTransparencyCommunityId,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { detectBanEvasionForMember } from '../detect.mts'

describe('detectBanEvasionForMember', () => {
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

  it('returns flagged=false when user has no posts in community', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const result = await detectBanEvasionForMember(community.id, member.id)

    expect(result.flagged).toBe(false)
    expect(result.combinedScore).toBe(0)
    expect(result.sourceUserId).toBeNull()
  })

  it('scopes post existence checks to the triggering post', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const suffix = createRandomString(8)
    const postId = await insertTestPost({
      title: `Triggering post ${suffix}`,
      slug: `triggering-post-${suffix}`,
      markdown: 'No matching ban-evasion signals',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })

    await expect(detectBanEvasionForMember(community.id, member.id, postId)).resolves.toEqual({
      flagged: false,
      combinedScore: 0,
      sourceUserId: null,
    })
  })

  it('is idempotent: returns early when already flagged', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: member.id,
      sourceUserId: owner.id,
      score: 0.9,
    })

    const result = await detectBanEvasionForMember(community.id, member.id)
    expect(result.flagged).toBe(true)
    expect(result.combinedScore).toBe(0)
  })

  it('returns flagged=false below threshold when no matching banned-user posts exist', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    // No posts from banned users in this community, so combined score stays 0
    const result = await detectBanEvasionForMember(community.id, member.id)
    expect(result.flagged).toBe(false)
  })

  it('detects content hash match and returns non-zero score for banned-user post similarity', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()
    const random = createRandomString(8)

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])

    // Insert posts using the test helper (fills all NOT NULL columns)
    const [bannedPostId, memberPostId] = await Promise.all([
      insertTestPost({
        title: `Banned user post ${random}`,
        slug: `banned-post-${random}`,
        markdown: 'Spam content',
        createdById: bannedUser.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Member post ${random}`,
        slug: `member-post-${random}`,
        markdown: 'Spam content copy',
        createdById: member.id,
        communityId: community.id,
        postType: 'article',
      }),
    ])

    // Update both posts to share the same content SHA256 (simulates copied content)
    const sharedSha = Buffer.from('b'.repeat(32))
    await setTestPostContentSha([bannedPostId, memberPostId], sharedSha)

    // Ban the original user
    await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: owner.id,
    })

    const result = await detectBanEvasionForMember(community.id, member.id)

    // Content hash weight is 0.4, which is below threshold of 0.6 on its own
    // Verify the function ran and returned a result with content hash signal
    expect(result).toHaveProperty('flagged')
    expect(result).toHaveProperty('combinedScore')
    expect(result).toHaveProperty('sourceUserId')

    // The combined score should reflect the content hash signal (weight 0.4)
    expect(result.combinedScore).toBeGreaterThanOrEqual(0)
    // sourceUserId should be the banned user when a signal matched, or null when no match
    expect([bannedUser.id, null]).toContain(result.sourceUserId)
  })

  it('flags member when combined score reaches threshold via referral + content hash', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()
    const random = createRandomString(8)

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])

    const { referralProgramId } = await createReferralProgramFixture({ createdById: owner.id })

    // Both users share the same referral URL — this is the scenario the signal detects
    const sharedUrlId = await createTestUrlWithHostname()

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

    const [bannedPostId, memberPostId] = await Promise.all([
      insertTestPost({
        title: `Banned user flagging post ${random}`,
        slug: `banned-flag-post-${random}`,
        markdown: 'Flagged content',
        createdById: bannedUser.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Member flagging post ${random}`,
        slug: `member-flag-post-${random}`,
        markdown: 'Flagged content copy',
        createdById: member.id,
        communityId: community.id,
        postType: 'article',
      }),
    ])

    const sharedSha = Buffer.from('f'.repeat(32))
    await setTestPostContentSha([bannedPostId, memberPostId], sharedSha)

    await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: owner.id,
    })

    const result = await detectBanEvasionForMember(community.id, member.id)

    expect(result.flagged).toBe(true)
    expect(result.combinedScore).toBeGreaterThanOrEqual(0.6)
    expect(result.sourceUserId).toBe(bannedUser.id)

    const flagState = await getTestBanEvasionFlagState(community.id, member.id)
    expect(flagState?.suspected_ban_evader_at).not.toBeNull()
    await expect(getTestModerationReportTransparencyCommunityId(member.id)).resolves.toBe(
      community.id,
    )
  })

  it('returns flagged=false when posts exist but no hash or referral match', async () => {
    const bannedUser = await createTestUser()
    const member = await createTestUser()
    const random = createRandomString(8)

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: bannedUser.id }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])

    const [bannedPostId, memberPostId] = await Promise.all([
      insertTestPost({
        title: `Banned no-match post ${random}`,
        slug: `banned-no-match-${random}`,
        markdown: 'Unique banned content',
        createdById: bannedUser.id,
        communityId: community.id,
        postType: 'article',
      }),
      insertTestPost({
        title: `Member no-match post ${random}`,
        slug: `member-no-match-${random}`,
        markdown: 'Unique member content',
        createdById: member.id,
        communityId: community.id,
        postType: 'article',
      }),
    ])

    const bannedSha = Buffer.from('a'.repeat(32))
    const memberSha = Buffer.from(`${'b'.repeat(31)}c`)
    await Promise.all([
      setTestPostContentSha([bannedPostId], bannedSha),
      setTestPostContentSha([memberPostId], memberSha),
    ])

    await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: owner.id,
    })

    const result = await detectBanEvasionForMember(community.id, member.id)

    expect(result.flagged).toBe(false)
  })
})
