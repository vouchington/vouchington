import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Import order matters here -- see the comment in undici-mock.mts.
import { createCaptchaUndiciMock, mockFetch } from '@voucha/test-helpers/captcha/undici-mock'
import { TEST_CAPTCHA_TOKEN } from '@voucha/test-helpers/captcha/test-captcha-token'
import { Response as UndiciResponse } from 'undici'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserWithAge,
  createTestUrlWithHostname,
  CONTRIBUTING_USER_AGE_MS,
  getContributionAdmissionConsumptionCountForTest,
  insertTestTopic,
  softDeleteTopic,
  mergeTopicForTest,
  hardDeleteTestUrl,
} from '@voucha/test-helpers'

vi.mock<typeof import('undici')>(import('undici'), () => createCaptchaUndiciMock())

describe('POST /api/v1/posts freshness after CAPTCHA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['deleted', 'merged'] as const)(
    'rechecks a category topic %s while CAPTCHA is pending',
    async state => {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const marker = crypto.randomUUID()
      const topicId = await insertTestTopic({
        name: `Category ${marker}`,
        slug: `category-${marker}`,
        createdById: user.id,
      })
      const destinationId = await insertTestTopic({
        name: `Destination ${marker}`,
        slug: `destination-${marker}`,
        createdById: user.id,
      })
      const request = createRequest()
      await request.authenticateAs(user)
      mockFetch.mockImplementationOnce(async () => {
        if (state === 'deleted') await softDeleteTopic(topicId, user.id)
        else await mergeTopicForTest(topicId, destinationId, user.id)
        return new UndiciResponse(JSON.stringify({ success: true }))
      })
      const response = await request
        .post('/api/v1/posts')
        .send({
          post_type: 'discussion',
          title: `Category changed ${marker}`,
          markdown: 'Fresh category.',
          categories: [{ type: 'topic', topic_id: topicId }],
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
        })
        .expect(422)
      expect(response.body.message).toBe('Topic category must reference an active topic')
      await expect(
        getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
      ).resolves.toBe(0)
    },
  )

  it('rechecks stored URL existence after CAPTCHA before the execution transaction writes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const urlId = await createTestUrlWithHostname()
    const request = createRequest()
    await request.authenticateAs(user)
    mockFetch.mockImplementationOnce(async () => {
      await hardDeleteTestUrl(urlId)
      return new UndiciResponse(JSON.stringify({ success: true }))
    })
    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'link',
        url_id: urlId,
        title: 'Stored URL changed',
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(422)
    expect(response.body.message).toBe('url_id does not exist')
    await expect(getContributionAdmissionConsumptionCountForTest(user.id, 'link')).resolves.toBe(0)
  })
})
