import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { getApiKeys } from '../api-keys'
import { fetchCaptchaConfig } from '../captcha-config'
import { getFeatureFlagsClient } from '../feature-flags'
import { exportRssFeeds, getRssFeedImport } from '../import-export'
import { markMyNotificationReadKeepalive } from '../my-notifications'
import { unsubscribeEmailToken } from '../my'
import { searchRssFeedsClient } from '../rss-feeds'
import { createMySupportThread } from '../support'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('simple client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads api keys through the client request helper', async () => {
    const response = { results: [] }
    mockGet.mockResolvedValueOnce(response)

    const result = await getApiKeys()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/api-keys')
    expect(result).toBe(response)
  })

  it('loads feature flags through the client request helper', async () => {
    const response = { flags: {}, overrides: {} }
    mockGet.mockResolvedValueOnce(response)

    expect(await getFeatureFlagsClient()).toBe(response)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/feature-flags')
  })

  it('loads captcha config through the client request helper', async () => {
    const response = { always_approve: false }
    mockGet.mockResolvedValueOnce(response)

    expect(await fetchCaptchaConfig()).toBe(response)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/captcha-config')
  })

  it('marks a notification read using keepalive fetch', async () => {
    const response = new Response(null, { status: 204 })
    const fetchMock = vi.fn<VitestLooseMock>().mockResolvedValueOnce(response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await markMyNotificationReadKeepalive('notification-1')

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/my/notifications/notification-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
    })
    expect(result).toBe(response)
  })

  it('returns the direct RSS export download URL', () => {
    expect(exportRssFeeds()).toBe('/api/v1/my/export/rss-feeds')
  })

  it('loads RSS feed import status through the client request helper', async () => {
    const response = { import: { id: 'import-1' }, rows: [] }
    mockGet.mockResolvedValueOnce(response)

    await expect(getRssFeedImport('import-1')).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/import/rss-feeds/import-1')
  })

  it('searches RSS feeds and returns results array', async () => {
    const feeds = [{ id: 'feed-1', title: 'Test Feed' }]
    mockGet.mockResolvedValueOnce({ results: feeds })

    const signal = new AbortController().signal
    const result = await searchRssFeedsClient('test', signal)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds?q=test&limit=10', { signal })
    expect(result).toBe(feeds)
  })

  it('creates my support thread through the client request helper', async () => {
    const response = { thread: { id: 'thread-1' }, message: null }
    const body = { subject: 'Need help', message: 'Hello' }
    mockPost.mockResolvedValueOnce(response)

    await expect(createMySupportThread(body)).resolves.toBe(response)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/my/support-threads', body)
  })

  it('posts a public email unsubscribe token in the request body', async () => {
    const response = { ok: true as const }
    mockPost.mockResolvedValueOnce(response)

    await expect(unsubscribeEmailToken('signed token')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/email-unsubscribe', {
      token: 'signed token',
    })
  })
})
