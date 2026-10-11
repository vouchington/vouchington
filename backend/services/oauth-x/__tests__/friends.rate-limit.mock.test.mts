import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectTestOAuthAccount,
  createRandomString,
  createTestUserDirect,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
  setTestXAccountExpiredToken,
} from '@voucha/test-helpers'
import { syncXFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncXFriends under a provider rate limit', () => {
  let xUserId: string

  beforeEach(async () => {
    xUserId = `x-${createRandomString(10)}`
    await insertTestOAuthAccount('x', xUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('x', user.id, xUserId)
    await setTestOAuthAccountAccessToken('x', xUserId, 'fake-access-token')
  })

  afterEach(() => {
    fetchSpy.mockReset()
  })

  it('requeues for the Retry-After when /following answers 429, not a 502', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '90' } }),
    )

    await expect(syncXFriends(xUserId)).rejects.toMatchObject({
      name: 'RateLimitError',
      delayMs: 90_000,
      cause: { status: 429, retryAfterMs: 90_000 },
    })
    await expect(getTestOAuthAccountFriendsSyncedAt('x', xUserId)).resolves.toBeNull()
  })

  it('requeues for the Retry-After when the token refresh answers 429', async () => {
    await setTestXAccountExpiredToken(xUserId, 'expired-token', `refresh-${createRandomString(8)}`)
    fetchSpy.mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '45' } }),
    )

    await expect(syncXFriends(xUserId)).rejects.toMatchObject({
      name: 'RateLimitError',
      delayMs: 45_000,
      cause: { status: 429, retryAfterMs: 45_000 },
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps every other failure a 502 under the queue attempts', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))

    await expect(syncXFriends(xUserId)).rejects.toMatchObject({
      status: 502,
      message: 'X /following request failed: 503',
    })
  })
})
