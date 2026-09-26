import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestDataPoint,
  insertTestTopic,
  setPostVotesScoreUp,
  setTopicReferralProgramId,
  updateTestMembershipExpiresAt,
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

describe('get-prioritized prioritized referral contributions and reviews', () => {
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

  it('counts contributions from topics linked to the referral program', async () => {
    const suffix = createRandomString(8)

    const cardTopicId = await insertTestTopic({
      name: `Card Topic ${suffix}`,
      slug: `card-topic-${suffix}`,
      createdById: admin.id,
      topicType: 'card',
    })
    await setTopicReferralProgramId(cardTopicId, referralProgramId)

    const [viewer, { user: bothUser }, { user: oneUser }, { user: noneUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink(`linked-both-${suffix}`),
      createUserWithLink(`linked-one-${suffix}`),
      createUserWithLink(`linked-none-${suffix}`),
    ])

    const reviewId = await insertTestPost({
      title: `Linked Review ${suffix}`,
      slug: `linked-review-${suffix}`,
      createdById: bothUser.id,
      markdown: 'review',
      postType: 'review',
    })

    // bothUser: data point + review on the linked topic; oneUser: only data point
    await Promise.all([
      insertTestDataPoint({
        title: `Linked DP ${suffix}`,
        slug: `linked-dp-${suffix}`,
        createdById: bothUser.id,
        topicId: cardTopicId,
      }),
      insertTestPostReview(reviewId, cardTopicId),
      insertTestDataPoint({
        title: `Linked DP2 ${suffix}`,
        slug: `linked-dp2-${suffix}`,
        createdById: oneUser.id,
        topicId: cardTopicId,
      }),
    ])

    // noneUser: no contributions

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

    expect(bothLink!.contribution_rank).toBe(1)
    expect(oneLink!.contribution_rank).toBe(2)
    expect(noneLink!.contribution_rank).toBe(3)
  }, 30_000)

  it('excludes elapsed finite entitlement tiers while retaining direct provider tiers', async () => {
    const [viewer, { user: elapsedAdmin }, { user: elapsedFamily }, { user: elapsedDirect }] =
      await Promise.all([
        createTestUser(),
        createUserWithLink('elapsed-admin-tier'),
        createUserWithLink('elapsed-family-tier'),
        createUserWithLink('elapsed-direct-tier'),
      ])
    const familyApplicationId = `family-tier-${createRandomString(8)}`
    const [adminMembership, familySku, directMembership] = await Promise.all([
      createTestMembership({ user_id: elapsedAdmin.id, plan: 'pro' }),
      createTestSku({ plan: 'pro', provider_application_id: familyApplicationId }),
      createTestMembership({
        user_id: elapsedDirect.id,
        plan: 'pro',
        stripe_subscription_id: `sub_elapsed_direct_${createRandomString(8)}`,
      }),
    ])
    const elapsedAt = new Date(Date.now() - 60_000)

    const familyMembership = await createTestFamilyMembership({
      applicationId: familyApplicationId,
      expiresAt: new Date(Date.now() + 60_000),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: elapsedFamily.id,
    })
    await Promise.all([
      updateTestMembershipExpiresAt(adminMembership.id, elapsedAt),
      updateTestMembershipExpiresAt(familyMembership.id, elapsedAt),
      updateTestMembershipExpiresAt(directMembership.id, elapsedAt),
    ])

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      all: true,
    })
    const tierByUserId = Object.fromEntries(
      result.links.map(link => [link.user_id, link.tier_rank]),
    )

    expect(tierByUserId[elapsedAdmin.id]).toBe(3)
    expect(tierByUserId[elapsedFamily.id]).toBe(3)
    expect(tierByUserId[elapsedDirect.id]).toBe(1)
  })

  it('returns review_post_id and review_avg_rating when user has a review', async () => {
    const [viewer, { user: reviewer }, { user: noReviewer }] = await Promise.all([
      createTestUser(),
      createUserWithLink('review-info'),
      createUserWithLink('no-review-info'),
    ])

    const suffix = createRandomString(8)
    const reviewPostId = await insertTestPost({
      title: `Review Info ${suffix}`,
      slug: `review-info-${suffix}`,
      createdById: reviewer.id,
      markdown: 'great program',
      postType: 'review',
    })
    await insertTestPostReview(reviewPostId, referralProgramId, 4)

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const reviewerLink = result.links.find(l => l.user_id === reviewer.id)
    const noReviewerLink = result.links.find(l => l.user_id === noReviewer.id)

    expect(reviewerLink).toBeDefined()
    expect(reviewerLink!.review_post_id).toBe(reviewPostId)
    expect(reviewerLink!.review_post_slug).toBe(`review-info-${suffix}`)
    expect(reviewerLink!.review_avg_rating).toBe(4)

    expect(noReviewerLink).toBeDefined()
    expect(noReviewerLink!.review_post_id).toBeNull()
    expect(noReviewerLink!.review_post_slug).toBeNull()
    expect(noReviewerLink!.review_avg_rating).toBeNull()
  }, 30_000)

  it('picks the review with highest votes_score_net when user has multiple reviews', async () => {
    const [viewer, { user: multiReviewer }] = await Promise.all([
      createTestUser(),
      createUserWithLink('multi-review'),
    ])

    const suffix = createRandomString(8)
    const [lowPostId, highPostId] = await Promise.all([
      insertTestPost({
        title: `Low Review ${suffix}`,
        slug: `low-review-${suffix}`,
        createdById: multiReviewer.id,
        markdown: 'meh',
        postType: 'review',
      }),
      insertTestPost({
        title: `High Review ${suffix}`,
        slug: `high-review-${suffix}`,
        createdById: multiReviewer.id,
        markdown: 'great',
        postType: 'review',
      }),
    ])
    await Promise.all([
      insertTestPostReview(lowPostId, referralProgramId, 2),
      insertTestPostReview(highPostId, referralProgramId, 5),
    ])
    await setPostVotesScoreUp(highPostId, 20)

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const link = result.links.find(l => l.user_id === multiReviewer.id)
    expect(link).toBeDefined()
    expect(link!.review_post_id).toBe(highPostId)
    expect(link!.review_post_slug).toBe(`high-review-${suffix}`)
    expect(link!.review_avg_rating).toBe(5)
  }, 30_000)

  it('includes best_score from linked topic contributions', async () => {
    const suffix = createRandomString(8)

    const cardTopicId = await insertTestTopic({
      name: `Card Topic Score ${suffix}`,
      slug: `card-topic-score-${suffix}`,
      createdById: admin.id,
      topicType: 'card',
    })
    await setTopicReferralProgramId(cardTopicId, referralProgramId)

    const [viewer, { user: highUser }, { user: lowUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink(`linked-score-high-${suffix}`),
      createUserWithLink(`linked-score-low-${suffix}`),
    ])

    const [highPostId] = await Promise.all([
      insertTestDataPoint({
        title: `Linked High Score ${suffix}`,
        slug: `linked-high-score-${suffix}`,
        createdById: highUser.id,
        topicId: cardTopicId,
      }),
      insertTestDataPoint({
        title: `Linked Low Score ${suffix}`,
        slug: `linked-low-score-${suffix}`,
        createdById: lowUser.id,
        topicId: cardTopicId,
      }),
    ])

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
  }, 30_000)
})
