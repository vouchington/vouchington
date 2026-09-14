import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  enableReferralProgramByTopicId,
  createTestReferralProgramLink,
  createTestUser,
} from '@voucha/test-helpers'
import { createProfileLink } from '@services/my/profile-links'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('Landing pages API', () => {
  let user: PrivateUser
  let topicId: string
  let reviewId: string
  let profileLinkId: string
  let referralLinkId: string

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Landing Program ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: `landing-program-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(topicId)

    reviewId = await insertTestReview({
      userId: user.id,
      title: 'Landing review',
      markdown: 'Landing review body',
      topicRatings: [{ topicId, rating: 5 }],
    })

    const profileLink = await createProfileLink(user.id, {
      link_type: 'url',
      url: 'https://example.com/profile-link',
      name: 'Profile link',
    })
    profileLinkId = profileLink.id

    referralLinkId = await createTestReferralProgramLink({
      userId: user.id,
      referralProgramId: topicId,
      url: 'https://example.com/referral-link',
      label: 'Referral CTA',
    })
  })
  it('creates, updates, and populates a landing page', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/landing-pages')
      .send({
        title: 'My Links',
        subtitle: 'Everything in one place',
        slug: 'my-links',
      })
      .expect(201)

    expect(created.body.landing_page.is_default).toBe(true)

    const pageId = created.body.landing_page.id as string

    const saved = await request
      .put(`/api/v1/my/landing-pages/${pageId}/items`)
      .send({
        items: [
          { type: 'profile_link', profile_link_id: profileLinkId },
          {
            type: 'topic_group',
            topic_id: topicId,
            entries: [
              { type: 'review', review_id: reviewId },
              { type: 'referral_link', referral_link_id: referralLinkId },
            ],
          },
        ],
      })
      .expect(200)

    expect(saved.body.landing_page.items).toHaveLength(2)
    expect(saved.body.landing_page.items[1].type).toBe('topic_group')

    const updated = await request
      .patch(`/api/v1/my/landing-pages/${pageId}`)
      .send({ title: 'Updated links', slug: 'updated-links' })
      .expect(200)

    expect(updated.body.landing_page.title).toBe('Updated links')
    expect(updated.body.landing_page.slug).toBe('updated-links')
  })

  it('lists landing pages for the current user without page_info', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/landing-pages')
      .send({ title: 'Second List', slug: `second-list-${Date.now()}` })
      .expect(201)

    const response = await request.get('/api/v1/my/landing-pages').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).not.toHaveProperty('page_info')
    expect(
      response.body.results.some(
        (page: { id: string }) => page.id === created.body.landing_page.id,
      ),
    ).toBe(true)
  })

  it('lists candidates for the current user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/landing-pages/candidates').expect(200)

    expect(response.body.candidates.can_create_landing_pages).toBe(true)
    expect(
      response.body.candidates.profile_links.some(
        (link: { id: string }) => link.id === profileLinkId,
      ),
    ).toBe(true)
    expect(
      response.body.candidates.reviews.some((review: { id: string }) => review.id === reviewId),
    ).toBe(true)
    expect(
      response.body.candidates.referral_links.some(
        (link: { id: string }) => link.id === referralLinkId,
      ),
    ).toBe(true)
  })
})
