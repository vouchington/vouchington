import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, hardDeleteTestUser } from '@voucha/test-helpers'
import { withTrustedLowScoreRequest } from '@voucha/test-helpers/trusted-low-score-request'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'

describe('POST /api/v1/attribution/referrer low-score session', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('does not challenge a low-score session attribution ping', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const user = await createTestUserDirect()
    try {
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did: v7(),
        sid: v7(),
      })
      await withTrustedLowScoreRequest(async request => {
        request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])
        request.set('Sec-Fetch-Site', 'same-origin')
        const response = await request
          .post('/api/v1/attribution/referrer')
          .send({ referrer: user!.id, landing_url: 'https://example.com/' })
          .expect(200)
        expect(response.body.ok).toBe(true)
      })
    } finally {
      await hardDeleteTestUser(user!.id)
    }
  })
})
