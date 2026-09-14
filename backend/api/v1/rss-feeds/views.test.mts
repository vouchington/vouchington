import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { getRecentlyViewedIds } from '@services/recently-viewed'
import { v7 } from 'uuid'

describe('POST /api/v1/rss-feeds/:rssFeedId/views', () => {
  let rssFeedId: string

  async function createSession() {
    const did = v7()
    const sid = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })
    return { sid, deviceToken, sessionToken }
  }

  function setSameOriginSessionCookies(
    request: ReturnType<typeof createRequest>,
    deviceToken: string,
    sessionToken: string,
  ): void {
    request.set('Cookie', `dt=${deviceToken}; st=${sessionToken}`)
    request.set('Sec-Fetch-Site', 'same-origin')
  }

  beforeAll(async () => {
    await createTestUserDirect()
    const feed = await createTestRssFeed({})
    rssFeedId = feed.id
  })

  it('returns 200 ok and records the view', async () => {
    const { sid, deviceToken, sessionToken } = await createSession()
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

    const res = await request.post(`/api/v1/rss-feeds/${rssFeedId}/views`).expect(200)

    expect(res.body.ok).toBe(true)
    const viewed = await getRecentlyViewedIds(sid, null, 'rss_feed')
    expect(viewed).toContain(rssFeedId)
  })

  it('returns 200 when view recording is rate limited', async () => {
    const { deviceToken, sessionToken } = await createSession()
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

    let res
    for (let i = 0; i < 7; i += 1) {
      res = await request.post(`/api/v1/rss-feeds/${rssFeedId}/views`).expect(200)
    }
    expect(res!.body.ok).toBe(true)
  })

  it('does not let one session rate limit another session from the same IP', async () => {
    const firstSession = await createSession()
    const firstRequest = createRequest()
    setSameOriginSessionCookies(
      firstRequest,
      firstSession.deviceToken.token,
      firstSession.sessionToken.token,
    )
    for (let i = 0; i < 7; i += 1) {
      await firstRequest.post(`/api/v1/rss-feeds/${rssFeedId}/views`).expect(200)
    }

    const secondSession = await createSession()
    const secondRequest = createRequest()
    setSameOriginSessionCookies(
      secondRequest,
      secondSession.deviceToken.token,
      secondSession.sessionToken.token,
    )

    await secondRequest.post(`/api/v1/rss-feeds/${rssFeedId}/views`).expect(200)

    const viewed = await getRecentlyViewedIds(secondSession.sid, null, 'rss_feed')
    expect(viewed).toContain(rssFeedId)
  })

  it('falls back to the IP rate limit key for invalid session cookies', async () => {
    const request = createRequest()
    request.set('Cookie', 'dt=invalid-device-token; st=invalid-session-token')
    request.set('Sec-Fetch-Site', 'same-origin')

    const res = await request.post(`/api/v1/rss-feeds/${rssFeedId}/views`).expect(200)

    expect(res.body.ok).toBe(true)
  })

  it('returns 200 without recording when Global Privacy Control is active', async () => {
    const { sid, deviceToken, sessionToken } = await createSession()
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

    const res = await request
      .post(`/api/v1/rss-feeds/${rssFeedId}/views`)
      .set('Sec-GPC', '1')
      .expect(200)

    expect(res.body.ok).toBe(true)
    const viewed = await getRecentlyViewedIds(sid, null, 'rss_feed')
    expect(viewed).not.toContain(rssFeedId)
  })

  it('returns 400 for invalid UUID', async () => {
    const { deviceToken, sessionToken } = await createSession()
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

    await request.post('/api/v1/rss-feeds/not-a-uuid/views').expect(400)
  })
})
