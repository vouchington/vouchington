import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  connectTestOAuthAccount,
  createTestUserDirect,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
  setTestXAccountExpiredToken,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  getTestOAuthAccountAccessToken,
  getTestOAuthAccountRaw,
  insertTestFriend,
  countTestFriends,
  setTestOAuthAccountTokens,
} from '@voucha/test-helpers'
import { syncXFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncXFriends', () => {
  let xUserId: string
  let friendXUserId: string

  beforeEach(async () => {
    xUserId = `x-${createRandomString(10)}`
    friendXUserId = `x-friend-${createRandomString(10)}`
    await insertTestOAuthAccount('x', xUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('x', user.id, xUserId)
    await setTestOAuthAccountAccessToken('x', xUserId, 'fake-access-token')
    await insertTestOAuthAccount('x', friendXUserId, null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('syncs following and writes to x_friends table', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: friendXUserId, name: 'Test Friend', username: 'testfriend' }],
          meta: { result_count: 1 },
        }),
    })

    await syncXFriends(xUserId)

    const rows = await getTestFriend('x', xUserId, friendXUserId)
    expect(rows).toHaveLength(1)
  })

  it('dedupes duplicate friend IDs before batch insert', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: friendXUserId, name: 'Test Friend', username: 'testfriend' },
            { id: friendXUserId, name: 'Test Friend Duplicate', username: 'testfrienddup' },
          ],
          meta: { result_count: 2 },
        }),
    })

    await expect(syncXFriends(xUserId)).resolves.toBeUndefined()

    const rows = await getTestFriend('x', xUserId, friendXUserId)
    expect(rows).toHaveLength(1)
    await expect(countTestFriends('x', xUserId)).resolves.toBe(1)
  })

  it('updates friends_synced_at after sync', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { result_count: 0 } }),
    })

    await syncXFriends(xUserId)

    const friendsSyncedAt = await getTestOAuthAccountFriendsSyncedAt('x', xUserId)
    expect(friendsSyncedAt).toBeTruthy()
  })

  it('refreshes access token when expired', async () => {
    const expiredToken = `expired-token-${createRandomString(8)}`
    const refreshToken = `refresh-${createRandomString(8)}`
    const newAccessToken = `new-token-${createRandomString(8)}`

    await setTestXAccountExpiredToken(xUserId, expiredToken, refreshToken)

    fetchSpy
      // First call: token refresh
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: newAccessToken,
            refresh_token: refreshToken,
            expires_in: 7200,
          }),
      })
      // Second call: following list
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], meta: { result_count: 0 } }),
      })

    await syncXFriends(xUserId)

    const accessToken = await getTestOAuthAccountAccessToken('x', xUserId)
    expect(accessToken).toBe(newAccessToken)
  })

  it('persists rotated refresh credentials before a paginated fetch can fail', async () => {
    const expiredToken = `expired-token-${createRandomString(8)}`
    const refreshToken = `refresh-${createRandomString(8)}`
    const newAccessToken = `new-token-${createRandomString(8)}`
    const newRefreshToken = `new-refresh-${createRandomString(8)}`

    await setTestXAccountExpiredToken(xUserId, expiredToken, refreshToken)

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            expires_in: 7200,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            meta: { next_token: 'next-page', result_count: 0 },
          }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 })

    await expect(syncXFriends(xUserId)).rejects.toThrow('X /following request failed: 503')

    const account = await getTestOAuthAccountRaw('x', xUserId)
    expect(account?.access_token).toBe(newAccessToken)
    expect(account?.refresh_token).toBe(newRefreshToken)
    await expect(getTestOAuthAccountFriendsSyncedAt('x', xUserId)).resolves.toBeNull()
  })

  it('does not overwrite credentials updated by same-user reauthorization', async () => {
    const expiredToken = `expired-token-${createRandomString(8)}`
    const refreshToken = `refresh-${createRandomString(8)}`
    const staleAccessToken = `stale-access-${createRandomString(8)}`
    const staleRefreshToken = `stale-refresh-${createRandomString(8)}`
    const currentAccessToken = `current-access-${createRandomString(8)}`
    const currentRefreshToken = `current-refresh-${createRandomString(8)}`

    await setTestXAccountExpiredToken(xUserId, expiredToken, refreshToken)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        await setTestOAuthAccountTokens('x', xUserId, {
          accessToken: currentAccessToken,
          refreshToken: currentRefreshToken,
        })
        return {
          access_token: staleAccessToken,
          refresh_token: staleRefreshToken,
          expires_in: 7200,
        }
      },
    })

    await syncXFriends(xUserId)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const account = await getTestOAuthAccountRaw('x', xUserId)
    expect(account?.access_token).toBe(currentAccessToken)
    expect(account?.refresh_token).toBe(currentRefreshToken)
  })

  it('removes unfollowed users on re-sync', async () => {
    const unfollowedId = `x-unfollowed-${createRandomString(10)}`

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: friendXUserId, name: 'Test Friend', username: 'testfriend' },
            { id: unfollowedId, name: 'Unfollowed Friend', username: 'unfollowed' },
          ],
          meta: { result_count: 2 },
        }),
    })
    await syncXFriends(xUserId)

    const beforeCleanup = await getTestFriend('x', xUserId, unfollowedId)
    expect(beforeCleanup).toHaveLength(1)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: friendXUserId, name: 'Test Friend', username: 'testfriend' }],
          meta: { result_count: 1 },
        }),
    })
    await syncXFriends(xUserId)

    const staleRows = await getTestFriend('x', xUserId, unfollowedId)
    expect(staleRows).toHaveLength(0)

    const validRows = await getTestFriend('x', xUserId, friendXUserId)
    expect(validRows).toHaveLength(1)
  })

  it('preserves friends inserted by a newer overlapping sync', async () => {
    const concurrentFriendId = `x-concurrent-${createRandomString(10)}`

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        await insertTestFriend('x', xUserId, concurrentFriendId)
        return {
          data: [{ id: friendXUserId, name: 'Test Friend', username: 'testfriend' }],
          meta: { result_count: 1 },
        }
      },
    })

    await syncXFriends(xUserId)

    const concurrentRows = await getTestFriend('x', xUserId, concurrentFriendId)
    expect(concurrentRows).toHaveLength(1)
  })

  it('does nothing if account has no access token', async () => {
    const noTokenId = `x-no-token-${createRandomString(8)}`
    await insertTestOAuthAccount('x', noTokenId, null)

    await syncXFriends(noTokenId)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not repopulate friends for a detached account', async () => {
    const detachedId = `x-detached-${createRandomString(8)}`
    await insertTestOAuthAccount('x', detachedId, null)
    await setTestOAuthAccountAccessToken('x', detachedId, 'fake-access-token')
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: friendXUserId, name: 'Test Friend', username: 'testfriend' }],
          meta: { result_count: 1 },
        }),
    })

    await syncXFriends(detachedId)

    await expect(getTestFriend('x', detachedId, friendXUserId)).resolves.toEqual([])
  })
})
