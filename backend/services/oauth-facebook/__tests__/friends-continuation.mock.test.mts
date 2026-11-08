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
import { syncFacebookFriends } from '../friends.mts'
import { oauthFacebookWorkConfig } from '../work-limits.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

function page(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) }
}

describe('syncFacebookFriends continuation', () => {
  let facebookUserId: string
  let restoreLimits: (() => void) | undefined

  beforeEach(async () => {
    facebookUserId = `fb-${createRandomString(10)}`
    await insertTestOAuthAccount('facebook', facebookUserId, null)
    const user = await createTestUserDirect()
    await connectTestOAuthAccount('facebook', user.id, facebookUserId)
    await setTestOAuthAccountAccessToken('facebook', facebookUserId, 'fake-access-token')
  })

  afterEach(() => {
    restoreLimits?.()
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('stops at the page cap and resumes from the provider cursor under the same start time', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthFacebookWorkConfig, {
      max_provider_pages_per_run: 1,
    })
    const firstId = `fb-first-${createRandomString(10)}`
    const secondId = `fb-second-${createRandomString(10)}`
    fetchSpy.mockResolvedValueOnce(
      page({
        data: [{ id: firstId, name: 'First' }],
        paging: { cursors: { after: 'c2' }, next: 'n' },
      }),
    )

    const resume = await syncFacebookFriends(facebookUserId)

    expect(resume).toMatchObject({ phase: 'pages', cursor: 'c2' })
    expect(await getTestFriend('facebook', facebookUserId, firstId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId)).toBeNull()

    fetchSpy.mockResolvedValueOnce(page({ data: [{ id: secondId, name: 'Second' }], paging: {} }))
    await expect(syncFacebookFriends(facebookUserId, resume!)).resolves.toBeNull()

    expect(String(fetchSpy.mock.calls[1]![0])).toContain('after=c2')
    expect(await getTestFriend('facebook', facebookUserId, secondId)).toHaveLength(1)
    expect(await getTestFriend('facebook', facebookUserId, firstId)).toHaveLength(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId)).toBeTruthy()
  })

  it('continues stale-edge cleanup in a follow-up run once the batch cap is reached', async () => {
    restoreLimits = overrideDynamicConfigFieldsForTest(oauthFacebookWorkConfig, {
      friend_mutation_batch_size: 1,
      max_finalize_batches_per_run: 1,
    })
    await insertTestFriends('facebook', facebookUserId, [
      `fb-stale-a-${createRandomString(8)}`,
      `fb-stale-b-${createRandomString(8)}`,
    ])
    fetchSpy.mockResolvedValueOnce(page({ data: [], paging: {} }))

    const resume = await syncFacebookFriends(facebookUserId)

    expect(resume).toMatchObject({ phase: 'finalize' })
    expect(await countTestFriends('facebook', facebookUserId)).toBe(1)
    expect(await getTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId)).toBeNull()

    await expect(syncFacebookFriends(facebookUserId, resume!)).resolves.toMatchObject({
      phase: 'finalize',
    })
    await expect(syncFacebookFriends(facebookUserId, resume!)).resolves.toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await countTestFriends('facebook', facebookUserId)).toBe(0)
    expect(await getTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId)).toBeTruthy()
  })
})
