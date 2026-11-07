import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestReferralProgramLink,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  insertTestLandingCandidateProfileLink,
  mutateTestLandingCandidateSources,
  readTestLandingCandidateSources,
} from '@voucha/test-helpers/landing-page-candidate-sources'
import { getMyLandingPageCandidates } from './candidates.mts'

describe('landing candidate source maintenance', () => {
  it('admits all source types, atomically transfers ownership, and cascades hard deletion', async () => {
    const owner = await createTestUser()
    const nextOwner = await createTestUser()
    const profile = await insertTestLandingCandidateProfileLink(owner.id)
    expect(profile.during).toEqual([
      {
        user_id: owner.id,
        profile_link_id: profile.id,
        review_post_id: null,
        referral_link_id: null,
        tier: 2,
        sort_order: 0,
      },
    ])
    const reviewId = await insertTestReview({ userId: owner.id, topicRatings: [] })
    const topicId = await insertTestTopic({
      createdById: owner.id,
      topicType: 'referral_program',
      name: `Candidate source ${crypto.randomUUID()}`,
      slug: `candidate-source-${crypto.randomUUID()}`,
    })
    await enableReferralProgramByTopicId(topicId)
    const referralId = await createTestReferralProgramLink({
      userId: owner.id,
      referralProgramId: topicId,
      label: 'Candidate source',
      url: 'https://example.com/candidate-source',
    })
    const sourceIds = [profile.id, reviewId, referralId]
    const original = await readTestLandingCandidateSources(sourceIds)
    expect(original).toEqual([
      {
        user_id: owner.id,
        profile_link_id: profile.id,
        review_post_id: null,
        referral_link_id: null,
        tier: 2,
        sort_order: 0,
      },
      {
        user_id: owner.id,
        profile_link_id: null,
        review_post_id: reviewId,
        referral_link_id: null,
        tier: 1,
        sort_order: null,
      },
      {
        user_id: owner.id,
        profile_link_id: null,
        review_post_id: null,
        referral_link_id: referralId,
        tier: 0,
        sort_order: null,
      },
    ])
    const mutations = [
      { kind: 'profile' as const, id: profile.id, ownerId: nextOwner.id, sortOrder: 7 },
      { kind: 'review' as const, id: reviewId, ownerId: nextOwner.id, postType: 'review' as const },
      { kind: 'referral' as const, id: referralId, ownerId: nextOwner.id },
    ]
    const during = await mutateTestLandingCandidateSources(mutations, { rollback: true })
    expect(during).toEqual(
      original.map(row => ({
        ...row,
        user_id: nextOwner.id,
        sort_order: row.tier === 2 ? 7 : null,
      })),
    )
    expect(await readTestLandingCandidateSources(sourceIds)).toEqual(original)
    await mutateTestLandingCandidateSources(mutations)
    expect((await getMyLandingPageCandidates(owner.id)).candidates).toMatchObject({
      profile_links: [],
      reviews: [],
      referral_links: [],
    })
    const moved = await getMyLandingPageCandidates(nextOwner.id)
    expect(moved.candidates.profile_links.map(row => row.id)).toEqual([profile.id])
    expect(moved.candidates.reviews.map(row => row.id)).toEqual([reviewId])
    expect(moved.candidates.referral_links.map(row => row.id)).toEqual([referralId])
    expect(
      await mutateTestLandingCandidateSources([
        { kind: 'delete_profile', id: profile.id },
        { kind: 'delete_review', id: reviewId },
        { kind: 'delete_referral', id: referralId },
      ]),
    ).toEqual([])
    expect(await readTestLandingCandidateSources(sourceIds)).toEqual([])
    expect((await getMyLandingPageCandidates(nextOwner.id)).candidates).toMatchObject({
      profile_links: [],
      reviews: [],
      referral_links: [],
    })
  })

  it('rolls back source admission and removes or restores a reclassified review', async () => {
    const owner = await createTestUser()
    const rolledBack = await insertTestLandingCandidateProfileLink(owner.id, { rollback: true })
    expect(rolledBack.during).toHaveLength(1)
    expect(await readTestLandingCandidateSources([rolledBack.id])).toEqual([])
    const reviewId = await insertTestReview({ userId: owner.id, topicRatings: [] })
    expect(
      await mutateTestLandingCandidateSources([
        { kind: 'review', id: reviewId, ownerId: owner.id, postType: 'discussion' },
      ]),
    ).toEqual([])
    expect((await getMyLandingPageCandidates(owner.id)).candidates.reviews).toEqual([])
    const restored = await mutateTestLandingCandidateSources([
      { kind: 'review', id: reviewId, ownerId: owner.id, postType: 'review' },
    ])
    expect(restored).toMatchObject([{ review_post_id: reviewId, user_id: owner.id, tier: 1 }])
    expect(
      (await getMyLandingPageCandidates(owner.id)).candidates.reviews.map(row => row.id),
    ).toEqual([reviewId])
    expect(
      await mutateTestLandingCandidateSources([
        { kind: 'review', id: reviewId, ownerId: null, postType: 'review' },
      ]),
    ).toEqual([])
    expect((await getMyLandingPageCandidates(owner.id)).candidates.reviews).toEqual([])
  })
})
