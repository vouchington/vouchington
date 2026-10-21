import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestDataPoint,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  mergeTopicForTest,
  setTopicReferralProgramId,
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
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('getPrioritizedReferralLinks merged topics', () => {
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

  it('stops counting contributions on a linked topic once it is merged', async () => {
    const suffix = createRandomString(8)
    const [linkedTopicId, destinationTopicId] = await Promise.all([
      insertTestTopic({
        name: `Merged Card ${suffix}`,
        slug: `merged-card-${suffix}`,
        createdById: admin.id,
        topicType: 'card',
      }),
      insertTestTopic({
        name: `Merge Target ${suffix}`,
        slug: `merge-target-${suffix}`,
        createdById: admin.id,
        topicType: 'card',
      }),
    ])
    await setTopicReferralProgramId(linkedTopicId, referralProgramId)
    const [viewer, { user: contributor }] = await Promise.all([
      createTestUser(),
      createUserWithLink(`merged-${suffix}`),
    ])
    const reviewId = await insertTestPost({
      title: `Merged Review ${suffix}`,
      slug: `merged-review-${suffix}`,
      createdById: contributor.id,
      markdown: 'review',
      postType: 'review',
    })
    await Promise.all([
      insertTestDataPoint({
        title: `Merged DP ${suffix}`,
        slug: `merged-dp-${suffix}`,
        createdById: contributor.id,
        topicId: linkedTopicId,
      }),
      insertTestPostReview(reviewId, linkedTopicId),
    ])

    const before = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 100 })
    const beforeLink = before.links.find(l => l.user_id === contributor.id)
    expect(beforeLink?.contribution_rank).toBe(1)
    expect(beforeLink?.review_post_id).toBe(reviewId)

    await mergeTopicForTest(linkedTopicId, destinationTopicId, admin.id)

    const after = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 100 })
    const afterLink = after.links.find(l => l.user_id === contributor.id)
    expect(afterLink).toBeDefined()
    expect(afterLink!.contribution_rank).toBe(3)
    expect(afterLink!.review_post_id).toBeNull()
    expect(afterLink!.review_avg_rating).toBeNull()
  }, 30_000)
})
