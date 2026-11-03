import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  createTestMembership,
  insertTestPost,
  insertTestPostReview,
  insertTestDataPoint,
  setPostVotesScoreUp,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { loadOutOfNetworkLinks } from '../out-of-network.mts'

let admin: PrivateUser

let referralProgramId: string

let testHostname: string

/** The uncached ranking behind the shared out-of-network list. */
async function rankedLinks() {
  return (await loadOutOfNetworkLinks(referralProgramId)).others
}

async function createUserWithLink(
  labelPrefix: string,
): Promise<{ user: PrivateUser; linkId: string }> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const suffix = createRandomString(8)
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized prioritized referral out-of-network ranking', () => {
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
  })

  it('sorts by contribution rank within a group', async () => {
    const [{ user: bothUser }, { user: oneUser }, { user: noneUser }] = await Promise.all([
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
    const result = await rankedLinks()

    const group5 = result.links
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
  })

  it('sorts by membership tier rank within same contribution rank', async () => {
    const [{ user: proUser }, { user: plusUser }, { user: freeUser }] = await Promise.all([
      createUserWithLink('tier-pro'),
      createUserWithLink('tier-plus'),
      createUserWithLink('tier-free'),
    ])

    await Promise.all([
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
      createTestMembership({ user_id: plusUser.id, plan: 'plus' }),
    ])

    // Use a high limit to ensure all users appear
    const result = await rankedLinks()

    const group5 = result.links
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
  })

  it('sorts by best score within same contribution and tier rank', async () => {
    const [{ user: highUser }, { user: lowUser }] = await Promise.all([
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

    const result = await rankedLinks()

    const group5 = result.links
    const highLink = group5.find(l => l.user_id === highUser.id)
    const lowLink = group5.find(l => l.user_id === lowUser.id)

    expect(highLink).toBeDefined()
    expect(lowLink).toBeDefined()
    expect(highLink!.best_score).toBeGreaterThan(lowLink!.best_score)

    const highIdx = group5.findIndex(l => l.user_id === highUser.id)
    const lowIdx = group5.findIndex(l => l.user_id === lowUser.id)
    expect(highIdx).toBeLessThan(lowIdx)
  })
})
