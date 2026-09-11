import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  createTestUserDirect,
  setTestOAuthAccountAccessToken,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  countTestFriends,
  insertTestFriend,
} from '@voucha/test-helpers'
import { syncGithubFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncGithubFriends', () => {
  const githubUserId = String(Math.floor(Math.random() * 1_000_000) + 200_000)
  const friendGithubUserId = String(Math.floor(Math.random() * 1_000_000) + 300_000)

  beforeAll(async () => {
    await insertTestOAuthAccount('github', githubUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('github', user.id, githubUserId)
    await setTestOAuthAccountAccessToken('github', githubUserId, 'fake-access-token')
    await insertTestOAuthAccount('github', friendGithubUserId, null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  function githubFollowingResponse(
    users: Array<{ id: number; login: string }>,
    link?: string,
  ): Response {
    return new Response(JSON.stringify(users), {
      status: 200,
      headers: link ? { Link: link } : undefined,
    })
  }

  it('syncs following and writes to github_friends table', async () => {
    fetchSpy.mockResolvedValueOnce(
      githubFollowingResponse([{ id: Number(friendGithubUserId), login: 'testfriend' }]),
    )

    await syncGithubFriends(githubUserId)

    const rows = await getTestFriend('github', githubUserId, friendGithubUserId)
    expect(rows).toHaveLength(1)
  })

  it('updates friends_synced_at after sync', async () => {
    fetchSpy.mockResolvedValueOnce(githubFollowingResponse([]))

    await syncGithubFriends(githubUserId)

    const friendsSyncedAt = await getTestOAuthAccountFriendsSyncedAt('github', githubUserId)
    expect(friendsSyncedAt).toBeTruthy()
  })

  it('stops after an exact-size page without a next link', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: 400_000 + i,
      login: `friend-${i}`,
    }))

    fetchSpy.mockResolvedValueOnce(githubFollowingResponse(page1))

    await syncGithubFriends(githubUserId)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('follows a next link even when the current page is short', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        githubFollowingResponse(
          [{ id: 500_001, login: 'page-one-friend' }],
          '<https://api.github.com/user/following?per_page=100&page=2>; rel="next"',
        ),
      )
      .mockResolvedValueOnce(githubFollowingResponse([{ id: 500_002, login: 'page-two-friend' }]))

    await syncGithubFriends(githubUserId)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('page=2')
  })

  it('stops when a later page omits the next link', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        githubFollowingResponse(
          [{ id: 510_001, login: 'page-one-friend' }],
          '<https://api.github.com/user/following?per_page=100&page=2>; rel="next"',
        ),
      )
      .mockResolvedValueOnce(githubFollowingResponse([{ id: 510_002, login: 'final-friend' }]))

    await syncGithubFriends(githubUserId)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not follow an off-origin next link with the OAuth credential', async () => {
    fetchSpy.mockResolvedValueOnce(
      githubFollowingResponse(
        [{ id: 520_001, login: 'page-one-friend' }],
        '<https://attacker.example/following?page=2>; rel="next"',
      ),
    )

    await syncGithubFriends(githubUserId)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('removes unfollowed users on re-sync', async () => {
    const unfollowedId = String(Math.floor(Math.random() * 1_000_000) + 600_000)

    // First sync: follow two users
    fetchSpy.mockResolvedValueOnce(
      githubFollowingResponse([
        { id: Number(friendGithubUserId), login: 'friend1' },
        { id: Number(unfollowedId), login: 'friend2' },
      ]),
    )
    await syncGithubFriends(githubUserId)

    const beforeUnfollow = await countTestFriends('github', githubUserId)
    expect(beforeUnfollow).toBeGreaterThanOrEqual(2)

    // Second sync: only friend1 remains (friend2 was unfollowed)
    fetchSpy.mockResolvedValueOnce(
      githubFollowingResponse([{ id: Number(friendGithubUserId), login: 'friend1' }]),
    )
    await syncGithubFriends(githubUserId)

    // friend2 should be deleted
    const staleRows = await getTestFriend('github', githubUserId, unfollowedId)
    expect(staleRows).toHaveLength(0)

    // friend1 should still exist
    const validRows = await getTestFriend('github', githubUserId, friendGithubUserId)
    expect(validRows).toHaveLength(1)
  })

  it('preserves friends inserted by a newer overlapping sync', async () => {
    const concurrentFriendId = String(Math.floor(Math.random() * 1_000_000) + 700_000)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      json: async () => {
        await insertTestFriend('github', githubUserId, concurrentFriendId)
        return [{ id: Number(friendGithubUserId), login: 'friend1' }]
      },
    })

    await syncGithubFriends(githubUserId)

    const concurrentRows = await getTestFriend('github', githubUserId, concurrentFriendId)
    expect(concurrentRows).toHaveLength(1)
  })

  it('does nothing if account has no access token', async () => {
    const noTokenId = String(Math.floor(Math.random() * 1_000_000) + 500_000)
    await insertTestOAuthAccount('github', noTokenId, null)

    await syncGithubFriends(noTokenId)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not repopulate friends for a detached account', async () => {
    const detachedId = String(Math.floor(Math.random() * 1_000_000) + 800_000)
    await insertTestOAuthAccount('github', detachedId, null)
    await setTestOAuthAccountAccessToken('github', detachedId, 'fake-access-token')
    fetchSpy.mockResolvedValueOnce(
      githubFollowingResponse([{ id: Number(friendGithubUserId), login: 'testfriend' }]),
    )

    await syncGithubFriends(detachedId)

    await expect(getTestFriend('github', detachedId, friendGithubUserId)).resolves.toEqual([])
  })
})
