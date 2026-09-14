import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { updateCommunityPostTypeSettings } from '@services/communities'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/communities/:idOrSlug/posts replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('replays a committed post after the community disables its post type', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicSuffix = crypto.randomUUID()
    const community = await insertTestCommunity({
      createdById: user.id,
      allow_review_posts: true,
    })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })
    const topicId = await insertTestTopic({
      name: `Durable review replay topic ${topicSuffix}`,
      slug: `durable-review-replay-${topicSuffix}`,
      createdById: user.id,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const idempotencyKey = crypto.randomUUID()
    const body = {
      post_type: 'review',
      title: 'Durable review replay',
      markdown:
        'This review explains the community contribution in careful detail and evaluates the submitted evidence against the published criteria. It identifies meaningful benefits, limitations, and practical tradeoffs for readers who need reliable information before making decisions. The conclusion summarizes the reasoning and gives a clear recommendation based on the available facts.',
      review_topic_ratings: [{ topic_id: topicId, rating: 4 }],
      categories: [{ type: 'topic', topic_id: topicId }],
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }

    const first = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
    expect(first.status).toBe(201)

    await updateCommunityPostTypeSettings(
      user,
      community.id,
      { allow_review_posts: false },
      membership,
    )
    await softDeleteTopic(topicId, user.id)

    const replay = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201)

    expect(replay.body).toEqual(first.body)
  })
})
