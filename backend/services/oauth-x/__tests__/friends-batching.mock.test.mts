import { afterEach, describe, it, vi } from 'vitest'
import {
  assertBoundedStaleFriendCleanup,
  assertFriendsPageCommitsBeforeOwnerDeletion,
} from '@voucha/test-helpers/services/oauth/friends-batch-sync'
import { oauthXWorkConfig } from '../work-limits.mts'
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

  it('keeps a committed page and discards the next page after owner deletion', async () => {
    await assertFriendsPageCommitsBeforeOwnerDeletion({
      provider: 'x',
      providerUserIdPrefix: 'x-batch-',
      firstFriendIdPrefix: 'x-first-',
      secondFriendIdPrefix: 'x-second-',
      syncFriends: syncXFriends,
      fetchSpy,
      firstPage: friendId => ({
        data: [{ id: friendId, name: 'First Friend', username: 'first' }],
        meta: { next_token: 'next-page' },
      }),
      secondPage: friendId => ({
        data: [{ id: friendId, name: 'Second Friend', username: 'second' }],
        meta: {},
      }),
    })
  })

  it('commits each bounded stale-row cleanup page separately', async () => {
    await assertBoundedStaleFriendCleanup({
      provider: 'x',
      providerUserIdPrefix: 'x-batch-',
      staleFriendIdPrefix: 'x-stale',
      syncFriends: syncXFriends,
      fetchSpy,
      workConfig: oauthXWorkConfig,
      emptyPage: { data: [], meta: {} },
    })
  })
})
