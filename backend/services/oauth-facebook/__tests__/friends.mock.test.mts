import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  connectTestOAuthAccount,
  createTestUserDirect,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriend,
} from '@voucha/test-helpers'
import { syncFacebookFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncFacebookFriends', () => {
  const facebookUserId = `fb-${createRandomString(10)}`
  const friendFacebookUserId = `fb-friend-${createRandomString(10)}`

  beforeAll(async () => {
    // Insert test facebook account with a fake access token
    await insertTestOAuthAccount('facebook', facebookUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('facebook', user.id, facebookUserId)
    await setTestOAuthAccountAccessToken('facebook', facebookUserId, 'fake-access-token')
    // Insert test friend account
    await insertTestOAuthAccount('facebook', friendFacebookUserId, null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('syncs friends and writes to facebook_friends table', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: friendFacebookUserId, name: 'Test Friend' }],
          paging: {},
        }),
    })

    await syncFacebookFriends(facebookUserId)

    const rows = await getTestFriend('facebook', facebookUserId, friendFacebookUserId)
    expect(rows).toHaveLength(1)
  })

  it('updates friends_synced_at after sync', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], paging: {} }),
    })

    await syncFacebookFriends(facebookUserId)

    const friendsSyncedAt = await getTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId)
    expect(friendsSyncedAt).toBeTruthy()
  })

  it('removes unfollowed users on re-sync', async () => {
    const unfollowedId = `fb-unfollowed-${createRandomString(10)}`

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: friendFacebookUserId, name: 'Test Friend' },
            { id: unfollowedId, name: 'Unfollowed Friend' },
          ],
          paging: {},
        }),
    })
    await syncFacebookFriends(facebookUserId)

    const beforeCleanup = await getTestFriend('facebook', facebookUserId, unfollowedId)
    expect(beforeCleanup).toHaveLength(1)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: friendFacebookUserId, name: 'Test Friend' }],
          paging: {},
        }),
    })
    await syncFacebookFriends(facebookUserId)

    const staleRows = await getTestFriend('facebook', facebookUserId, unfollowedId)
    expect(staleRows).toHaveLength(0)

    const validRows = await getTestFriend('facebook', facebookUserId, friendFacebookUserId)
    expect(validRows).toHaveLength(1)
  })

  it('preserves friends inserted by a newer overlapping sync', async () => {
    const concurrentFriendId = `fb-concurrent-${createRandomString(10)}`

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        await insertTestFriend('facebook', facebookUserId, concurrentFriendId)
        return {
          data: [{ id: friendFacebookUserId, name: 'Test Friend' }],
          paging: {},
        }
      },
    })

    await syncFacebookFriends(facebookUserId)

    const concurrentRows = await getTestFriend('facebook', facebookUserId, concurrentFriendId)
    expect(concurrentRows).toHaveLength(1)
  })

  it('does nothing if account has no access token', async () => {
    const noTokenId = `fb-no-token-${createRandomString(8)}`
    await insertTestOAuthAccount('facebook', noTokenId, null)

    await syncFacebookFriends(noTokenId)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not repopulate friends for a detached account', async () => {
    const detachedId = `fb-detached-${createRandomString(8)}`
    await insertTestOAuthAccount('facebook', detachedId, null)
    await setTestOAuthAccountAccessToken('facebook', detachedId, 'fake-access-token')
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: friendFacebookUserId, name: 'Test Friend' }] }),
    })

    await syncFacebookFriends(detachedId)

    await expect(getTestFriend('facebook', detachedId, friendFacebookUserId)).resolves.toEqual([])
  })
})
