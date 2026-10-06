import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { searchRecentlyViewed } from '@services/recently-viewed'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { v7 } from 'uuid'

describe('RSS feed view suspension guard', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('does not record a user-owned recent view from a suspended session', async () => {
    const user = await createTestUser()
    const feed = await createTestRssFeed({})
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7(), uid: user.id })
    const request = createRequest()
    request.set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
    request.set('Sec-Fetch-Site', 'same-origin')

    suspendedUserIds.push(user.id)
    await suspendTestUser(user.id)

    const response = await request.post(`/api/v1/rss-feeds/${feed.id}/views`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await searchRecentlyViewed('rss_feed', null, user.id)).not.toContain(feed.id)
  })
})
