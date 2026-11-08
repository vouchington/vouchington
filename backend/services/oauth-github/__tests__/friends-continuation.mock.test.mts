import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectTestOAuthAccount,
  countTestFriends,
  createRandomString,
  createTestUserDirect,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriends,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { syncGithubFriends } from '../friends.mts'
import { oauthGithubWorkConfig } from '../work-limits.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const NEXT_LINK = '<https://api.github.com/user/following?per_page=100&page=2>; rel="next"'

function following(users: Array<{ id: number; login: string }>, link?: string): Response {
  return new Response(JSON.stringify(users), {
    status: 200,
    headers: link ? { Link: link } : undefined,
  })
}

describe('syncGithubFriends continuation', () => {
  let githubUserId: string
  let restoreLimits: (() => void) | undefined

  beforeEach(async () => {
    githubUserId = String(Math.floor(Math.random() * 1_000_000) + 400_000)
    await insertTestOAuthAccount('github', githubUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('github', user.id, githubUserId)
    await setTestOAuthAccountAccessToken('github', githubUserId, 'fake-access-token')
  })

  afterEach(() => {
    restoreLimits?.()
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('stops at the page cap and resumes from the next page number', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthGithubWorkConfig, {
      max_provider_pages_per_run: 1,
    })
    const firstId = `${900_000 + Math.floor(Math.random() * 99_999)}`
    const secondId = `${100_000 + Math.floor(Math.random() * 99_999)}`
    fetchSpy.mockResolvedValueOnce(following([{ id: Number(firstId), login: 'first' }], NEXT_LINK))

    const resume = await syncGithubFriends(githubUserId)

    expect(resume).toMatchObject({ phase: 'pages', cursor: '2' })
    expect(await getTestFriend('github', githubUserId, firstId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('github', githubUserId)).toBeNull()

    fetchSpy.mockResolvedValueOnce(following([{ id: Number(secondId), login: 'second' }]))
    await expect(syncGithubFriends(githubUserId, resume!)).resolves.toBeNull()

    expect(String(fetchSpy.mock.calls[1]![0])).toContain('page=2')
    expect(await getTestFriend('github', githubUserId, secondId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('github', githubUserId)).toBeTruthy()
  })

  it('continues stale-edge cleanup in a follow-up run once the batch cap is reached', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthGithubWorkConfig, {
      friend_mutation_batch_size: 1,
      max_finalize_batches_per_run: 1,
    })
    await insertTestFriends('github', githubUserId, [
      `stale-a-${createRandomString(8)}`,
      `stale-b-${createRandomString(8)}`,
    ])
    fetchSpy.mockResolvedValueOnce(following([]))

    const resume = await syncGithubFriends(githubUserId)

    expect(resume).toMatchObject({ phase: 'finalize' })
    expect(await countTestFriends('github', githubUserId)).toBe(1)

    // Each finalize continuation carries the last deleted key, so successive jobs get distinct identities.
    const second = await syncGithubFriends(githubUserId, resume!)
    expect(second).toMatchObject({ phase: 'finalize' })
    expect(second!.cursor).toBeTruthy()
    expect(second!.cursor).not.toBe(resume!.cursor)
    await expect(syncGithubFriends(githubUserId, second!)).resolves.toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await countTestFriends('github', githubUserId)).toBe(0)
    expect(await getTestOAuthAccountFriendsSyncedAt('github', githubUserId)).toBeTruthy()
  })

  it('resumes stale-edge cleanup strictly after the last finalized key', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthGithubWorkConfig, {
      friend_mutation_batch_size: 1,
      max_finalize_batches_per_run: 1,
    })
    const suffix = createRandomString(8)
    await insertTestFriends('github', githubUserId, [`stale-b-${suffix}`, `stale-c-${suffix}`])
    fetchSpy.mockResolvedValueOnce(following([]))
    const resume = await syncGithubFriends(githubUserId)
    expect(resume).toMatchObject({ phase: 'finalize', cursor: `stale-b-${suffix}` })

    // A stale row ordered before the cursor is not revisited: the next run starts after the cursor.
    await insertTestFriends('github', githubUserId, [`stale-a-${suffix}`])
    const second = await syncGithubFriends(githubUserId, resume!)

    expect(second).toMatchObject({ phase: 'finalize', cursor: `stale-c-${suffix}` })
    expect(await getTestFriend('github', githubUserId, `stale-a-${suffix}`)).toHaveLength(1)
    expect(await getTestFriend('github', githubUserId, `stale-c-${suffix}`)).toHaveLength(0)
  })
})
