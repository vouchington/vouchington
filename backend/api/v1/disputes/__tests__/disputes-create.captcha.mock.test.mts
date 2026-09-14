import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { Response as UndiciResponse } from 'undici'
import type { PrivateUser } from '@services/users/types'
import type * as Undici from 'undici'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { createTopicClaim } from '@services/topic-claims/create'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/disputes CAPTCHA', () => {
  let staffUser: PrivateUser
  let claimant: PrivateUser
  let reviewPostId: string
  let topicId: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    const creator = await createTestUser()
    claimant = await createTestUser()
    topicId = await insertTestTopic({
      name: `Dispute Captcha Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `dispute-captcha-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)
    const reviewer = await createTestUser()
    reviewPostId = await insertTestPost({
      title: `Dispute Captcha Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `dispute-captcha-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'The product has serious flaws.',
      postType: 'review',
    })
    await insertTestPostReview(reviewPostId, topicId, 1)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockImplementation(async () => {
      return new UndiciResponse(JSON.stringify({ success: true }))
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 422 when the Turnstile token is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)

    const response = await request
      .post('/api/v1/disputes')
      .send({ post_id: reviewPostId, reason: 'factually_inaccurate', claim_text: 'test' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('creates the dispute and forwards the token when verification passes', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)

    const response = await request
      .post('/api/v1/disputes')
      .send({
        post_id: reviewPostId,
        reason: 'factually_inaccurate',
        claim_text: `Captcha test dispute ${crypto.randomUUID()}`,
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(res => {
        expect([200, 201]).toContain(res.status)
      })

    expect(response.body.dispute).toHaveProperty('id')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })

  it('redacts member create and duplicate response keys', async () => {
    const reviewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Dispute response privacy ${crypto.randomUUID().slice(0, 8)}`,
      slug: `dispute-response-privacy-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'A review used to verify member response privacy.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 1)

    const request = createRequest()
    await request.authenticateAs(claimant)
    const body = {
      post_id: postId,
      reason: 'factually_inaccurate',
      claim_text: `Private dispute claim ${crypto.randomUUID()}`,
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }
    const created = await request.post('/api/v1/disputes').send(body).expect(201)
    const duplicate = await request.post('/api/v1/disputes').send(body).expect(200)

    for (const response of [created, duplicate]) {
      const rawJson = JSON.stringify(response.body)
      for (const field of [
        'disputant_user_id',
        'claim_text',
        'recommended_action',
        'ai_public_response',
        'ai_internal_response',
        'model',
        'ai_drafted_at',
        'internal_notes',
        'drafted_at',
        'edited_at',
        'edited_by_id',
        'approved_by_id',
        'resolved_by_id',
        'latest_lifecycle_change_id',
        'staff_context',
      ]) {
        expect(rawJson).not.toContain(`"${field}"`)
      }
    }
  })
})
