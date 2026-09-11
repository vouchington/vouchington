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
import { syncXFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncXFriends batching', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('commits a completed provider page before the next page reacquires the deletion fence', async () => {
    const { providerUserId, userId } = await createXSyncAccount()
    const firstFriendId = `x-first-${createRandomString(10)}`
    const secondFriendId = `x-second-${createRandomString(10)}`
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: firstFriendId, name: 'First Friend', username: 'first' }],
          meta: { next_token: 'next-page' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          await softDeleteUser(userId)
          return {
            data: [{ id: secondFriendId, name: 'Second Friend', username: 'second' }],
            meta: {},
          }
        },
      })

    await expect(syncXFriends(providerUserId)).rejects.toThrow('cannot own new data after deletion')
    await expect(getTestFriend('x', providerUserId, firstFriendId)).resolves.toHaveLength(1)
    await expect(getTestFriend('x', providerUserId, secondFriendId)).resolves.toEqual([])
    await expect(getTestOAuthAccountFriendsSyncedAt('x', providerUserId)).resolves.toBeNull()
  })

  it('commits each bounded stale-row cleanup page separately', async () => {
    const { providerUserId } = await createXSyncAccount()
    const friendIds = makeFriendIds('x-stale')
    await insertTestFriends('x', providerUserId, friendIds)
    const rowLock = await acquireTestFriendRowLock('x', providerUserId, friendIds.at(-1)!)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], meta: {} }) })

    const sync = syncXFriends(providerUserId)
    try {
      await expect.poll(() => countTestFriends('x', providerUserId)).toBe(1)
    } finally {
      await rowLock.release()
    }
    await expect(sync).resolves.toBeUndefined()
    await expect(countTestFriends('x', providerUserId)).resolves.toBe(0)
  })
})

async function createXSyncAccount(): Promise<{ providerUserId: string; userId: string }> {
  const providerUserId = `x-batch-${createRandomString(12)}`
  const user = await createTestUserDirect()
  await insertTestOAuthAccount('x', providerUserId, null)
  await connectTestOAuthAccount('x', user.id, providerUserId)
  await setTestOAuthAccountAccessToken('x', providerUserId, 'fake-access-token')
  return { providerUserId, userId: user.id }
}

function makeFriendIds(prefix: string): string[] {
  const suffix = createRandomString(10)
  return Array.from(
    { length: 1001 },
    (_, index) => `${prefix}-${suffix}-${String(index).padStart(4, '0')}`,
  )
}
