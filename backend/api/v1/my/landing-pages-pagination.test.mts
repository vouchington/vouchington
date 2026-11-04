import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestReferralProgramLink,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createProfileLink } from '@services/my/profile-links'
import { createMyLandingPage } from '@services/my/landing-pages/create'
import { landingPageLimitsConfig } from '@services/my/landing-pages/limits'
import { LANDING_PAGE_ITEM_LIMIT_REACHED } from '@modules/on-error/error-codes'

// Exercise the response and generated query contract at the authenticated route boundary.
describe('landing page candidates pagination', () => {
  it('continues across candidate types without repeating or dropping an entity', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Landing ${crypto.randomUUID()}`,
      slug: `landing-${crypto.randomUUID()}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(topicId)
    const link = await createProfileLink(user.id, {
      link_type: 'url',
      url: 'https://example.com/profile',
    })
    const older = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId, rating: 4 }],
    })
    const newer = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId, rating: 5 }],
    })
    const referral = await createTestReferralProgramLink({
      userId: user.id,
      referralProgramId: topicId,
      url: 'https://example.com/referral',
      label: 'Referral',
    })
    const request = createRequest()
    await request.authenticateAs(user)
    let after: string | undefined
    const seen: string[] = []
    for (let page = 0; page < 4; page++) {
      const response = await request
        .get('/api/v1/my/landing-pages/candidates')
        .query({ limit: 1, ...(after ? { after } : {}) })
        .expect(200)
      const candidates = response.body.candidates
      const ids = [
        ...candidates.profile_links,
        ...candidates.reviews,
        ...candidates.referral_links,
      ].map((item: { id: string }) => item.id)
      expect(ids).toHaveLength(1)
      seen.push(...ids)
      expect(response.body.page_info.has_next_page).toBe(page < 3)
      expect(response.body.item_limit).toBeGreaterThan(0)
      after = response.body.page_info.end_cursor ?? undefined
    }
    expect(seen).toEqual([link.id, newer, older, referral])
  })

  it("rejects anonymous callers, malformed cursors, and another owner's cursor", async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    await createProfileLink(user.id, { link_type: 'url', url: 'https://example.com/profile' })
    const request = createRequest()
    await request.get('/api/v1/my/landing-pages/candidates').expect(401)
    await request.authenticateAs(user)
    const first = await request.get('/api/v1/my/landing-pages/candidates').expect(200)
    await request.get('/api/v1/my/landing-pages/candidates').query({ after: 'invalid' }).expect(400)
    await request.authenticateAs(other)
    await request
      .get('/api/v1/my/landing-pages/candidates')
      .query({ after: first.body.page_info.start_cursor })
      .expect(400)
    const empty = await request.get('/api/v1/my/landing-pages/candidates').expect(200)
    expect(empty.body.candidates).toMatchObject({
      profile_links: [],
      reviews: [],
      referral_links: [],
    })
    expect(empty.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('returns the effective cap and preserves the coded limit error without changing saved items', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(landingPageLimitsConfig, { items_per_page: 1 }),
    )
    const user = await createTestUser()
    const other = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Cap', slug: 'cap' })
    const request = createRequest()
    await request.authenticateAs(user)
    const profile = await createProfileLink(user.id, {
      link_type: 'url',
      url: 'https://example.com/cap-profile',
    })
    const existing = { type: 'profile_link', profile_link_id: profile.id }
    const saved = await request
      .put(`/api/v1/my/landing-pages/${page.id}/items`)
      .send({ items: [existing] })
      .expect(200)
    expect(saved.body.item_limit).toBe(1)
    const rejected = await request
      .put(`/api/v1/my/landing-pages/${page.id}/items`)
      .send({ items: [existing, existing] })
      .expect(409)
    expect(rejected.body.code).toBe(LANDING_PAGE_ITEM_LIMIT_REACHED)
    const fetched = await request.get(`/api/v1/my/landing-pages/${page.id}`).expect(200)
    expect(fetched.body.item_limit).toBe(1)
    expect(fetched.body.landing_page.items).toEqual([
      expect.objectContaining({
        type: 'profile_link',
        profile_link: expect.objectContaining({ id: profile.id }),
      }),
    ])
    await request.authenticateAs(other)
    await request
      .put(`/api/v1/my/landing-pages/${page.id}/items`)
      .send({ items: [existing, existing] })
      .expect(404)
  })
})
