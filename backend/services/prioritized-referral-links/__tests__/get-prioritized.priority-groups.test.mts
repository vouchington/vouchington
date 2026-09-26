import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  createTestMembership,
  insertPostElectionVote,
  insertSessionReferralAttribution,
  insertTestLocalFollow,
  insertTestPost,
  insertTestPostReview,
  insertTestDataPoint,
  setPostVotesScoreUp,
  archivePostForTopHashtagTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'

let admin: PrivateUser

let referralProgramId: string

let testHostname: string

async function createUserWithLink(
  labelPrefix: string,
): Promise<{ user: PrivateUser; linkId: string }> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const suffix = createRandomString(8)
  const link = await createUserReferralLink(WEB_PROVENANCE, user, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized prioritized referral priority groups', () => {
  beforeAll(async () => {
    const testUser = await createTestUser({ administrator: true })
    if (!testUser) throw new Error('Failed to create test admin user')
    admin = testUser
    const suffix = createRandomString(8)
    testHostname = `prioritized-test-${suffix}.example.com`

    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  }, 30_000)

  it('returns empty array when no links exist', async () => {
    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links).toHaveLength(0)
    expect(Object.keys(result.users)).toHaveLength(0)
  })

  it('assigns priority groups correctly', async () => {
    const [
      viewer,
      { user: mutualFriend },
      { user: followed },
      { user: referrer },
      { user: upvotedAuthor },
      { user: stranger },
    ] = await Promise.all([
      createTestUser(),
      createUserWithLink('pg-mutual'),
      createUserWithLink('pg-followed'),
      createUserWithLink('pg-referrer'),
      createUserWithLink('pg-author'),
      createUserWithLink('pg-stranger'),
    ])

    const sessionId = crypto.randomUUID()
    const suffix = createRandomString(8)

    await Promise.all([
      // Group 1: mutual follow
      insertTestLocalFollow(viewer!.id, mutualFriend.id),
      insertTestLocalFollow(mutualFriend.id, viewer!.id),
      // Group 2: one-way follow
      insertTestLocalFollow(viewer!.id, followed.id),
      // Group 3: referrer
      insertSessionReferralAttribution(sessionId, referrer.id, 'https://example.com/', viewer!.id),
      // Group 4: upvoted author
      insertTestPost({
        title: `Test Post ${suffix}`,
        slug: `test-post-${suffix}`,
        createdById: upvotedAuthor.id,
        markdown: 'content',
      }).then(postId => insertPostElectionVote(viewer!.id, postId, 1)),
    ])

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId)

    const byUser = Object.fromEntries(result.links.map(l => [l.user_id, l.priority_group]))
    expect(byUser[mutualFriend.id]).toBe(1)
    expect(byUser[followed.id]).toBe(2)
    expect(byUser[referrer.id]).toBe(3)
    expect(byUser[upvotedAuthor.id]).toBe(4)
    expect(byUser[stranger.id]).toBe(5)
  }, 30_000)

  it('deduplicates: user qualifying for multiple groups appears in highest only', async () => {
    const [viewer, { user: multiUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('dedup'),
    ])

    const sessionId = crypto.randomUUID()
    // Make them mutual follow (group 1) AND referrer (group 3)
    await Promise.all([
      insertTestLocalFollow(viewer!.id, multiUser.id),
      insertTestLocalFollow(multiUser.id, viewer!.id),
      insertSessionReferralAttribution(sessionId, multiUser.id, 'https://example.com/', viewer!.id),
    ])

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId)

    const userLinks = result.links.filter(l => l.user_id === multiUser.id)
    expect(userLinks).toHaveLength(1)
    expect(userLinks[0].priority_group).toBe(1)
  })

  it('does not prioritize an author from an upvote on an ineligible post', async () => {
    const [viewer, { user: author }] = await Promise.all([
      createTestUser(),
      createUserWithLink('ineligible-upvote'),
    ])
    const postId = await insertTestPost({
      title: `Archived upvote ${createRandomString(8)}`,
      slug: `archived-upvote-${createRandomString(8)}`,
      createdById: author.id,
      markdown: 'content',
    })
    await insertPostElectionVote(viewer!.id, postId, 1)
    await archivePostForTopHashtagTest(postId, author.id)

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, { limit: 100 })

    expect(result.links.find(link => link.user_id === author.id)?.priority_group).toBe(5)
  })

  it('sorts by contribution rank within a group', async () => {
    const [viewer, { user: bothUser }, { user: oneUser }, { user: noneUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('contrib-both'),
      createUserWithLink('contrib-one'),
      createUserWithLink('contrib-none'),
    ])

    const suffix = createRandomString(8)

    // bothUser has data point + review for this referral program
    await insertTestDataPoint({
      title: `DP ${suffix}`,
      slug: `dp-${suffix}`,
      createdById: bothUser.id,
      topicId: referralProgramId,
    })
    const reviewId = await insertTestPost({
      title: `Review ${suffix}`,
      slug: `review-${suffix}`,
      createdById: bothUser.id,
      markdown: 'review',
      postType: 'review',
    })
    await insertTestPostReview(reviewId, referralProgramId)

    // oneUser has only data point
    await insertTestDataPoint({
      title: `DP2 ${suffix}`,
      slug: `dp2-${suffix}`,
      createdById: oneUser.id,
      topicId: referralProgramId,
    })

    // Use a high limit to ensure all users appear despite other test data in the DB
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const group5 = result.links.filter(l => l.priority_group === 5)
    const bothLink = group5.find(l => l.user_id === bothUser.id)
    const oneLink = group5.find(l => l.user_id === oneUser.id)
    const noneLink = group5.find(l => l.user_id === noneUser.id)

    expect(bothLink).toBeDefined()
    expect(oneLink).toBeDefined()
    expect(noneLink).toBeDefined()

    // both (rank 1) before one (rank 2) before none (rank 3)
    expect(bothLink!.contribution_rank).toBe(1)
    expect(oneLink!.contribution_rank).toBe(2)
    expect(noneLink!.contribution_rank).toBe(3)

    const bothIdx = group5.findIndex(l => l.user_id === bothUser.id)
    const oneIdx = group5.findIndex(l => l.user_id === oneUser.id)
    const noneIdx = group5.findIndex(l => l.user_id === noneUser.id)
    expect(bothIdx).toBeLessThan(oneIdx)
    expect(oneIdx).toBeLessThan(noneIdx)
  }, 30_000)

  it('sorts by membership tier rank within same contribution rank', async () => {
    const [viewer, { user: proUser }, { user: plusUser }, { user: freeUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('tier-pro'),
      createUserWithLink('tier-plus'),
      createUserWithLink('tier-free'),
    ])

    await Promise.all([
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
      createTestMembership({ user_id: plusUser.id, plan: 'plus' }),
    ])

    // Use a high limit to ensure all users appear
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const group5 = result.links.filter(l => l.priority_group === 5)
    const proLink = group5.find(l => l.user_id === proUser.id)
    const plusLink = group5.find(l => l.user_id === plusUser.id)
    const freeLink = group5.find(l => l.user_id === freeUser.id)

    expect(proLink).toBeDefined()
    expect(plusLink).toBeDefined()
    expect(freeLink).toBeDefined()

    expect(proLink!.tier_rank).toBe(1)
    expect(plusLink!.tier_rank).toBe(2)
    expect(freeLink!.tier_rank).toBe(3)

    const proIdx = group5.findIndex(l => l.user_id === proUser.id)
    const plusIdx = group5.findIndex(l => l.user_id === plusUser.id)
    const freeIdx = group5.findIndex(l => l.user_id === freeUser.id)
    expect(proIdx).toBeLessThan(plusIdx)
    expect(plusIdx).toBeLessThan(freeIdx)
  }, 30_000)

  it('sorts by best score within same contribution and tier rank', async () => {
    const [viewer, { user: highUser }, { user: lowUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('score-high'),
      createUserWithLink('score-low'),
    ])

    const suffix = createRandomString(8)

    // Both users have a data point for this referral program (same contribution_rank = 2)
    const [highPostId] = await Promise.all([
      insertTestDataPoint({
        title: `High Score ${suffix}`,
        slug: `high-score-${suffix}`,
        createdById: highUser.id,
        topicId: referralProgramId,
      }),
      insertTestDataPoint({
        title: `Low Score ${suffix}`,
        slug: `low-score-${suffix}`,
        createdById: lowUser.id,
        topicId: referralProgramId,
      }),
    ])

    // Directly set votes_score_up for highUser's post (votes_score_net = votes_score_up - votes_score_down)
    await setPostVotesScoreUp(highPostId, 10)

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const group5 = result.links.filter(l => l.priority_group === 5)
    const highLink = group5.find(l => l.user_id === highUser.id)
    const lowLink = group5.find(l => l.user_id === lowUser.id)

    expect(highLink).toBeDefined()
    expect(lowLink).toBeDefined()
    expect(highLink!.best_score).toBeGreaterThan(lowLink!.best_score)

    const highIdx = group5.findIndex(l => l.user_id === highUser.id)
    const lowIdx = group5.findIndex(l => l.user_id === lowUser.id)
    expect(highIdx).toBeLessThan(lowIdx)
  }, 30_000)
})
