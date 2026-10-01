import { afterEach, describe, it, vi } from 'vitest'
import {
  assertBoundedStaleFriendCleanup,
  assertFriendsPageCommitsBeforeDeletionFence,
} from '@voucha/test-helpers/services/oauth/friends-batch-sync'
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
    await assertFriendsPageCommitsBeforeDeletionFence({
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
      emptyPage: { data: [], meta: {} },
    })
  })
})
