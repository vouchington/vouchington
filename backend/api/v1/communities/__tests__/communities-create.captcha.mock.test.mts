import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserWithAge, createRandomString } from '@voucha/test-helpers'
import { getContributionActionLimitStatus } from '@services/contribution-gating/limits'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/communities CAPTCHA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 422 when the Turnstile token is missing', async () => {
    const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
    const request = createRequest()
    await request.authenticateAs(creator)

    const response = await request
      .post('/api/v1/communities')
      .set('Content-Type', 'application/json')
      .send({ name: `No Token Community ${createRandomString(8)}` })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
    await expect(
      getContributionActionLimitStatus(creator, null, 'community'),
    ).resolves.toMatchObject({
      short_window: { used: 0 },
      daily_window: { used: 0 },
    })
  })

  it('creates the community and forwards the token when verification passes', async () => {
    const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
    const random = createRandomString(8)
    const request = createRequest()
    await request.authenticateAs(creator)

    const response = await request
      .post('/api/v1/communities')
      .set('Content-Type', 'application/json')
      .send({
        name: `Token Community ${random}`,
        slug: `token-community-${random}`,
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(201)

    expect(response.body.community).toHaveProperty('id')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })
})
