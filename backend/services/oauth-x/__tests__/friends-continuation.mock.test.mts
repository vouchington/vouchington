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
import { syncXFriends } from '../friends.mts'
import { oauthXWorkConfig } from '../work-limits.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

function page(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) }
}

describe('syncXFriends continuation', () => {
  let xUserId: string
  let restoreLimits: (() => void) | undefined

  beforeEach(async () => {
    xUserId = `x-${createRandomString(10)}`
    await insertTestOAuthAccount('x', xUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('x', user.id, xUserId)
    await setTestOAuthAccountAccessToken('x', xUserId, 'fake-access-token')
  })

  afterEach(() => {
    restoreLimits?.()
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('stops at the page cap and resumes from the pagination token', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthXWorkConfig, {
      max_provider_pages_per_run: 1,
    })
    const firstId = `x-first-${createRandomString(10)}`
    const secondId = `x-second-${createRandomString(10)}`
    fetchSpy.mockResolvedValueOnce(
      page({
        data: [{ id: firstId, name: 'First', username: 'first' }],
        meta: { next_token: 'tok2' },
      }),
    )

    const resume = await syncXFriends(xUserId)

    expect(resume).toMatchObject({ phase: 'pages', cursor: 'tok2' })
    expect(await getTestFriend('x', xUserId, firstId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('x', xUserId)).toBeNull()

    fetchSpy.mockResolvedValueOnce(
      page({ data: [{ id: secondId, name: 'Second', username: 'second' }], meta: {} }),
    )
    await expect(syncXFriends(xUserId, resume!)).resolves.toBeNull()

    expect(String(fetchSpy.mock.calls[1]![0])).toContain('pagination_token=tok2')
    expect(await getTestFriend('x', xUserId, secondId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('x', xUserId)).toBeTruthy()
  })

  it('continues stale-edge cleanup in a follow-up run once the batch cap is reached', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthXWorkConfig, {
      friend_mutation_batch_size: 1,
      max_finalize_batches_per_run: 1,
    })
    await insertTestFriends('x', xUserId, [
      `x-stale-a-${createRandomString(8)}`,
      `x-stale-b-${createRandomString(8)}`,
    ])
    fetchSpy.mockResolvedValueOnce(page({ data: [], meta: {} }))

    const resume = await syncXFriends(xUserId)

    expect(resume).toMatchObject({ phase: 'finalize' })
    expect(await countTestFriends('x', xUserId)).toBe(1)

    await expect(syncXFriends(xUserId, resume!)).resolves.toMatchObject({ phase: 'finalize' })
    await expect(syncXFriends(xUserId, resume!)).resolves.toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await countTestFriends('x', xUserId)).toBe(0)
    expect(await getTestOAuthAccountFriendsSyncedAt('x', xUserId)).toBeTruthy()
  })
})
