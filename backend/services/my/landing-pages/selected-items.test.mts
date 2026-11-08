import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestReferralProgramLink,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers'
import { createTestLandingPageProfileLinkItem } from '@voucha/test-helpers/entities/landing-pages'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { paginationConfig } from '@services/pagination'
import { deactivateUserReferralLink } from '../../user-referral-program-links/activate.mts'
import { createMyLandingPage } from './create.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'
import { getMyLandingPage } from './get.mts'
import { getMyLandingPageCandidates } from './candidates.mts'
import { landingPageLimitsConfig } from './limits.mts'
import { LANDING_PAGE_ITEM_LIMIT_REACHED } from '@modules/on-error/error-codes'

describe('landing page submitted selections', () => {
  it('keeps equal IDs from different candidate types in their own arrays', async () => {
    const user = await createTestUser()
    const reviewId = await insertTestReview({ userId: user.id, topicRatings: [] })
    const page = await createMyLandingPage(user.id, { title: 'Equal IDs', slug: 'equal-ids' })
    await createTestLandingPageProfileLinkItem(user.id, page.id, reviewId)
    const { candidates, page_info } = await getMyLandingPageCandidates(user.id)
    expect(candidates.profile_links.map(link => link.id)).toEqual([reviewId])
    expect(candidates.reviews.map(review => review.id)).toEqual([reviewId])
    expect(candidates.referral_links).toEqual([])
    expect(page_info.has_next_page).toBe(false)
    const first = await getMyLandingPageCandidates(user.id, { limit: 1 })
    expect(first.candidates.profile_links.map(link => link.id)).toEqual([reviewId])
    expect(first.candidates.reviews).toEqual([])
    expect(first.page_info.has_next_page).toBe(true)
    const next = await getMyLandingPageCandidates(user.id, {
      limit: 1,
      after: first.page_info.end_cursor,
    })
    expect(next.candidates.profile_links).toEqual([])
    expect(next.candidates.reviews.map(review => review.id)).toEqual([reviewId])
    expect(next.page_info.has_next_page).toBe(false)
  })

  it('accepts an older selected review beyond the candidate page and hydrates it for editing', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(paginationConfig, { default_limit: 1 }))
    const user = await createTestUser()
    const older = await insertTestReview({ userId: user.id, topicRatings: [] })
    const newer = await insertTestReview({ userId: user.id, topicRatings: [] })
    const candidates = await getMyLandingPageCandidates(user.id)
    expect(candidates.candidates.reviews.map(review => review.id)).toEqual([newer])
    expect(candidates.page_info.has_next_page).toBe(true)
    const page = await createMyLandingPage(user.id, {
      title: 'Old selection',
      slug: 'old-selection',
    })
    const saved = await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'review', review_post_id: older },
    ])
    expect(saved.items).toEqual([
      expect.objectContaining({ type: 'review', review: expect.objectContaining({ id: older }) }),
    ])
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual(saved.items)
  })

  it('counts topic groups and their nested entries and preserves strict eligibility and membership checks', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(landingPageLimitsConfig, { items_per_page: 2 }),
    )
    const user = await createTestUser()
    const other = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Selected ${crypto.randomUUID()}`,
      slug: `selected-${crypto.randomUUID()}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(topicId)
    const review = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId, rating: 5 }],
    })
    const unrelated = await insertTestReview({ userId: user.id, topicRatings: [] })
    const foreign = await insertTestReview({
      userId: other.id,
      topicRatings: [{ topicId, rating: 4 }],
    })
    const referral = await createTestReferralProgramLink({
      userId: user.id,
      referralProgramId: topicId,
      label: 'Selected',
      url: 'https://example.com/selected',
    })
    const page = await createMyLandingPage(user.id, { title: 'Selected', slug: 'selected' })
    await replaceMyLandingPageItems(user.id, page.id, [
      {
        type: 'topic_group',
        topic_id: topicId,
        entries: [{ type: 'review', review_post_id: review }],
      },
    ])
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        {
          type: 'topic_group',
          topic_id: topicId,
          entries: [
            { type: 'review', review_post_id: review },
            { type: 'referral_link', referral_link_id: referral },
          ],
        },
      ]),
    ).rejects.toMatchObject({ status: 409, code: LANDING_PAGE_ITEM_LIMIT_REACHED })
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [{ type: 'review', review_post_id: foreign }]),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        {
          type: 'topic_group',
          topic_id: topicId,
          entries: [{ type: 'review', review_post_id: unrelated }],
        },
      ]),
    ).rejects.toMatchObject({ status: 400 })
    await setTestPostClearanceStatus(unrelated, 'pending', user.id)
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [{ type: 'review', review_post_id: unrelated }]),
    ).rejects.toMatchObject({ status: 400 })
    await deactivateUserReferralLink(user, referral)
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'referral_link', referral_link_id: referral },
      ]),
    ).rejects.toMatchObject({ status: 400 })
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual([
      expect.objectContaining({
        type: 'topic_group',
        entries: [
          expect.objectContaining({
            type: 'review',
            review: expect.objectContaining({ id: review }),
          }),
        ],
      }),
    ])
  })
})
