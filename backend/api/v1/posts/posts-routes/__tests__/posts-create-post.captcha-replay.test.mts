import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { TEST_CAPTCHA_TOKEN } from '@voucha/test-helpers/captcha/test-captcha-token'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import * as http from '@modules/utils/http'

const mockFetch = vi.fn<ReturnType<typeof http.getExternalFetch>>()

describe('POST /api/v1/posts replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(http, 'getExternalFetch').mockReturnValue(mockFetch)
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname: 'localhost', action: 'test' })),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('replays the committed response after its explicit topic category is deleted', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicSuffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Global post replay topic ${topicSuffix}`,
      slug: `global-post-replay-${topicSuffix}`,
      createdById: user.id,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const idempotencyKey = crypto.randomUUID()
    const body = {
      post_type: 'discussion',
      title: 'Durable global post replay',
      markdown: 'This post keeps its committed response when its category changes later.',
      categories: [{ type: 'topic', topic_id: topicId }],
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }

    const first = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201)

    await softDeleteTopic(topicId, user.id)

    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201)

    expect(replay.body).toEqual(first.body)
  })
})
