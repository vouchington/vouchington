import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { PLAYWRIGHT_CHROME_UA, TEST_USER_USERNAME } from '../helpers/constants.mts'
import { authenticateTestUserWithDirectSessionTokens } from '../helpers/routing-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR
if (!workerOrigin || !traceOrigin || !artifactsDir)
  throw new Error('Web integration environment is not configured')
let client: WebIntegrationClient

function expectDestination(response: Response, pathname: string): void {
  expect(response.status).toBe(307)
  const destination = new URL(response.headers.get('location') ?? '', workerOrigin)
  expect(destination.pathname).toBe(pathname)
  expect(destination.search).toBe('')
}

describe('owner-private route redirects', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })
  it('owner-private user aliases retain exact authenticated destinations', async () => {
    await authenticateTestUserWithDirectSessionTokens(client)
    const options = { redirect: 'manual' as const, userAgent: PLAYWRIGHT_CHROME_UA }

    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/communities/proxy-following`, options),
      '/my/communities/proxy-following',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/communities/proxy-muted`, options),
      '/my/communities/proxy-muted',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/communities/saved`, options),
      '/my/communities/saved',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/domains/blocked`, options),
      '/my/domains/blocked',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/domains/muted`, options),
      '/my/domains/muted',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/posts/following`, options),
      '/my/posts/following',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/posts/hidden`, options),
      '/my/posts/hidden',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/posts/saved`, options),
      '/my/posts/saved',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/rss-feed-items/hidden`, options),
      '/my/news-items/hidden',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/rss-feed-items/saved`, options),
      '/my/news-items/saved',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/rss-feed-items/viewed`, options),
      '/my/news-items/viewed',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/rss-feeds/muted`, options),
      '/my/news-sources/muted',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/topics/blocked`, options),
      '/my/topics/blocked',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/topics/dismissed-recommendations`, options),
      '/my/topics/dismissed-recommendations',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/topics/muted`, options),
      '/my/topics/muted',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/topics/viewed`, options),
      '/my/topics/viewed',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/users/dismissed-recommendations`, options),
      '/my/users/dismissed-recommendations',
    )
    expectDestination(
      await client.request(`/user/${TEST_USER_USERNAME}/users/blocked`, options),
      '/my/users/blocked',
    )
    const mutedUsers = await client.request(`/user/${TEST_USER_USERNAME}/users/muted`, options)
    expectDestination(mutedUsers, '/my/users/muted')
    expect(mutedUsers.status).toBe(307)
  })

  it('owner-private aliases also preserve destinations without authentication', async () => {
    client.clearCookies()
    const aliases = [
      ['communities/proxy-following', 'communities/proxy-following'],
      ['communities/proxy-muted', 'communities/proxy-muted'],
      ['communities/saved', 'communities/saved'],
      ['domains/blocked', 'domains/blocked'],
      ['domains/muted', 'domains/muted'],
      ['posts/following', 'posts/following'],
      ['posts/hidden', 'posts/hidden'],
      ['posts/saved', 'posts/saved'],
      ['rss-feed-items/hidden', 'news-items/hidden'],
      ['rss-feed-items/saved', 'news-items/saved'],
      ['rss-feed-items/viewed', 'news-items/viewed'],
      ['rss-feeds/muted', 'news-sources/muted'],
      ['topics/blocked', 'topics/blocked'],
      ['topics/dismissed-recommendations', 'topics/dismissed-recommendations'],
      ['topics/muted', 'topics/muted'],
      ['topics/viewed', 'topics/viewed'],
      ['users/dismissed-recommendations', 'users/dismissed-recommendations'],
      ['users/blocked', 'users/blocked'],
      ['users/muted', 'users/muted'],
    ]
    await Promise.all(
      aliases.map(async ([alias, destination]) => {
        const response = await client.request(`/user/${TEST_USER_USERNAME}/${alias}`, {
          redirect: 'manual',
          userAgent: PLAYWRIGHT_CHROME_UA,
        })
        expectDestination(response, `/my/${destination}`)
        expect(response.status).toBe(307)
      }),
    )
  })

  it('authenticated dismissed recommendations retain their onward destination', async () => {
    await authenticateTestUserWithDirectSessionTokens(client)
    const onward = await client.request('/my/users/dismissed-recommendations', {
      redirect: 'manual',
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
    expect(new URL(onward.headers.get('location') ?? '', workerOrigin).pathname).toBe(
      '/my/friend-recommendations/dismissed',
    )
  })
})
