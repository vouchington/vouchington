import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'

const landingUrl = 'https://example.com/'

describe('POST /api/v1/attribution/referrer - request contract validation', () => {
  it.each([
    ['a non-string referrer', { referrer: 5, landing_url: landingUrl }],
    ['a non-string landing_url', { referrer: 'someone', landing_url: { href: landingUrl } }],
    ['a non-object utm', { referrer: 'someone', landing_url: landingUrl, utm: 'instagram' }],
    [
      'a non-string utm_source',
      { referrer: 'someone', landing_url: landingUrl, utm: { utm_source: 5 } },
    ],
    [
      'an unknown utm field',
      { referrer: 'someone', landing_url: landingUrl, utm: { utm_term: 'x' } },
    ],
    ['an unknown top-level field', { referrer: 'someone', landing_url: landingUrl, extra: true }],
  ])('returns 422 for %s', async (_name, body) => {
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
      did: v7(),
      sid: v7(),
    })
    const request = createRequest()
    request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])
    request.set('Sec-Fetch-Site', 'same-origin')

    await request.post('/api/v1/attribution/referrer').send(body).expect(422)
  })
})
