import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect, createTestRssFeedItemWithUrl } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { searchRecentlyViewed } from '@services/recently-viewed'
import { v7 } from 'uuid'

describe('POST /api/v1/rss-feed-items/:id/views', () => {
  let userId: string
  let rssFeedItemId: string
  let deviceToken: { token: string }
  let sessionToken: { token: string }

  function setSameOriginSessionCookies(
    request: ReturnType<typeof createRequest>,
    dt: string,
    st: string,
  ): void {
    request.set('Cookie', `dt=${dt}; st=${st}`)
    request.set('Sec-Fetch-Site', 'same-origin')
  }

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
    const did = v7()
    const sid = v7()
    const tokens = await createDeviceAndSessionTokens({ did, sid, uid: userId })
    deviceToken = tokens.deviceToken
    sessionToken = tokens.sessionToken

    const feed = await createTestRssFeed({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    rssFeedItemId = item.id
  })

  it('returns 200 ok and records the view in the user key', async () => {
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

    const res = await request.post(`/api/v1/rss-feed-items/${rssFeedItemId}/views`).expect(200)

    expect(res.body.ok).toBe(true)
    const viewed = await searchRecentlyViewed('rss_feed_item', null, userId)
    expect(viewed).toContain(rssFeedItemId)
  })

  it('returns 200 when view recording is rate limited', async () => {
    const user2 = await createTestUserDirect()
    const did = v7()
    const tokens = await createDeviceAndSessionTokens({ did, uid: user2!.id })
    const request = createRequest()
    setSameOriginSessionCookies(request, tokens.deviceToken.token, tokens.sessionToken.token)

    const feed = await createTestRssFeed({})
    const item = await createTestRssFeedItemWithUrl(feed.id)

    let res
    for (let i = 0; i < 7; i += 1) {
      res = await request.post(`/api/v1/rss-feed-items/${item.id}/views`).expect(200)
    }
    expect(res!.body.ok).toBe(true)
    // Rate-limited requests should not record; item appears at most once
    const viewed = await searchRecentlyViewed('rss_feed_item', null, user2!.id)
    expect(viewed.filter(id => id === item.id)).toHaveLength(1)
  })

  it('does not let one session rate limit another session from the same IP', async () => {
    const firstUser = await createTestUserDirect()
    const firstTokens = await createDeviceAndSessionTokens({ did: v7(), uid: firstUser!.id })
    const firstRequest = createRequest()
    setSameOriginSessionCookies(
      firstRequest,
      firstTokens.deviceToken.token,
      firstTokens.sessionToken.token,
    )
    const firstFeed = await createTestRssFeed({})
    const firstItem = await createTestRssFeedItemWithUrl(firstFeed.id)
    for (let i = 0; i < 7; i += 1) {
      await firstRequest.post(`/api/v1/rss-feed-items/${firstItem.id}/views`).expect(200)
    }

    const secondUser = await createTestUserDirect()
    const secondTokens = await createDeviceAndSessionTokens({ did: v7(), uid: secondUser!.id })
    const secondRequest = createRequest()
    setSameOriginSessionCookies(
      secondRequest,
      secondTokens.deviceToken.token,
      secondTokens.sessionToken.token,
    )
    const secondFeed = await createTestRssFeed({})
    const secondItem = await createTestRssFeedItemWithUrl(secondFeed.id)

    await secondRequest.post(`/api/v1/rss-feed-items/${secondItem.id}/views`).expect(200)

    const viewed = await searchRecentlyViewed('rss_feed_item', null, secondUser!.id)
    expect(viewed).toContain(secondItem.id)
  })

  it('falls back to the IP rate limit key for invalid session cookies', async () => {
    const request = createRequest()
    request.set('Cookie', 'dt=invalid-device-token; st=invalid-session-token')
    request.set('Sec-Fetch-Site', 'same-origin')

    const res = await request.post(`/api/v1/rss-feed-items/${rssFeedItemId}/views`).expect(200)

    expect(res.body.ok).toBe(true)
  })

  it('returns 200 without recording when Global Privacy Control is active', async () => {
    const user3 = await createTestUserDirect()
    const did = v7()
    const tokens = await createDeviceAndSessionTokens({ did, uid: user3!.id })
    const request = createRequest()
    setSameOriginSessionCookies(request, tokens.deviceToken.token, tokens.sessionToken.token)

    const feed = await createTestRssFeed({})
    const item = await createTestRssFeedItemWithUrl(feed.id)

    const res = await request
      .post(`/api/v1/rss-feed-items/${item.id}/views`)
      .set('Sec-GPC', '1')
      .expect(200)

    expect(res.body.ok).toBe(true)
    const viewed = await searchRecentlyViewed('rss_feed_item', null, user3!.id)
    expect(viewed).not.toContain(item.id)
  })

  it('returns 400 for invalid UUID', async () => {
    const request = createRequest()
    setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)
    await request.post('/api/v1/rss-feed-items/not-a-uuid/views').expect(400)
  })

  it('returns 200 ok for unauthenticated requests', async () => {
    const request = createRequest()
    const res = await request.post(`/api/v1/rss-feed-items/${rssFeedItemId}/views`).expect(200)
    expect(res.body.ok).toBe(true)
  })
})
