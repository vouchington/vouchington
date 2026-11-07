import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestReferralProgramLink,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { insertTestLandingCandidateProfileLink } from '@voucha/test-helpers/landing-page-candidate-sources'
import { decodeCursor } from '@modules/pagination'
import { getMyLandingPageCandidates } from './candidates.mts'

describe('mixed landing candidate pages', () => {
  it('fills pages across tier boundaries while keeping the public cursor and both ID directions', async () => {
    const owner = await createTestUser()
    const profile = await insertTestLandingCandidateProfileLink(owner.id)
    const reviews = []
    for (let index = 0; index < 2; index++)
      reviews.push(await insertTestReview({ userId: owner.id, topicRatings: [] }))
    const topicId = await insertTestTopic({
      createdById: owner.id,
      topicType: 'referral_program',
      name: `Mixed candidates ${crypto.randomUUID()}`,
      slug: `mixed-candidates-${crypto.randomUUID()}`,
    })
    await enableReferralProgramByTopicId(topicId)
    const referrals = []
    for (let index = 0; index < 2; index++)
      referrals.push(
        await createTestReferralProgramLink({
          userId: owner.id,
          referralProgramId: topicId,
          label: `Mixed ${index}`,
          url: `https://example.com/mixed-candidate-${index}`,
        }),
      )
    const reviewIds = reviews.toSorted().toReversed()
    const referralIds = referrals.toSorted().toReversed()
    const first = await getMyLandingPageCandidates(owner.id, { limit: 2 })
    expect(first.candidates.profile_links.map(row => row.id)).toEqual([profile.id])
    expect(first.candidates.reviews.map(row => row.id)).toEqual([reviewIds[0]])
    expect(first.candidates.referral_links).toEqual([])
    expect(first.page_info.has_next_page).toBe(true)
    expect(decodeCursor(first.page_info.end_cursor!)).toEqual({
      id: reviewIds[0],
      tier: 1,
      sort_order: null,
      scope: `landing-page-candidates:user:${owner.id}:type-desc-profile-order-id`,
    })
    const next = await getMyLandingPageCandidates(owner.id, {
      limit: 2,
      after: first.page_info.end_cursor,
    })
    expect(next.candidates.profile_links).toEqual([])
    expect(next.candidates.reviews.map(row => row.id)).toEqual([reviewIds[1]])
    expect(next.candidates.referral_links.map(row => row.id)).toEqual([referralIds[0]])
    expect(next.page_info.has_next_page).toBe(true)
    expect(decodeCursor(next.page_info.end_cursor!)).toMatchObject({
      id: referralIds[0],
      tier: 0,
      sort_order: null,
    })
    const last = await getMyLandingPageCandidates(owner.id, {
      limit: 2,
      after: next.page_info.end_cursor,
    })
    expect(last.candidates.profile_links).toEqual([])
    expect(last.candidates.reviews).toEqual([])
    expect(last.candidates.referral_links.map(row => row.id)).toEqual([referralIds[1]])
    expect(last.page_info.has_next_page).toBe(false)
  })
})
