import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireTestFriendRowLock,
  connectTestOAuthAccount,
  countTestFriends,
  createRandomString,
  createTestUserDirect,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriends,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
  softDeleteUser,
} from '@voucha/test-helpers'
import { syncFacebookFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncFacebookFriends batching', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('commits a completed provider page before the next page reacquires the deletion fence', async () => {
    const { providerUserId, userId } = await createFacebookSyncAccount()
    const firstFriendId = `fb-first-${createRandomString(10)}`
    const secondFriendId = `fb-second-${createRandomString(10)}`
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: firstFriendId, name: 'First Friend' }],
          paging: { cursors: { after: 'next-page' }, next: 'next-page' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          await softDeleteUser(userId)
          return { data: [{ id: secondFriendId, name: 'Second Friend' }], paging: {} }
        },
      })

    await expect(syncFacebookFriends(providerUserId)).rejects.toThrow(
      'cannot own new data after deletion',
    )
    await expect(getTestFriend('facebook', providerUserId, firstFriendId)).resolves.toHaveLength(1)
    await expect(getTestFriend('facebook', providerUserId, secondFriendId)).resolves.toEqual([])
    await expect(getTestOAuthAccountFriendsSyncedAt('facebook', providerUserId)).resolves.toBeNull()
  })

  it('commits each bounded stale-row cleanup page separately', async () => {
    const { providerUserId } = await createFacebookSyncAccount()
    const friendIds = makeFriendIds('fb-stale')
    await insertTestFriends('facebook', providerUserId, friendIds)
    const rowLock = await acquireTestFriendRowLock('facebook', providerUserId, friendIds.at(-1)!)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], paging: {} }) })

    const sync = syncFacebookFriends(providerUserId)
    try {
      await expect.poll(() => countTestFriends('facebook', providerUserId)).toBe(1)
    } finally {
      await rowLock.release()
    }
    await expect(sync).resolves.toBeUndefined()
    await expect(countTestFriends('facebook', providerUserId)).resolves.toBe(0)
  })
})

async function createFacebookSyncAccount(): Promise<{ providerUserId: string; userId: string }> {
  const providerUserId = `fb-batch-${createRandomString(12)}`
  const user = await createTestUserDirect()
  await insertTestOAuthAccount('facebook', providerUserId, null)
  await connectTestOAuthAccount('facebook', user.id, providerUserId)
  await setTestOAuthAccountAccessToken('facebook', providerUserId, 'fake-access-token')
  return { providerUserId, userId: user.id }
}

function makeFriendIds(prefix: string): string[] {
  const suffix = createRandomString(10)
  return Array.from(
    { length: 1001 },
    (_, index) => `${prefix}-${suffix}-${String(index).padStart(4, '0')}`,
  )
}
