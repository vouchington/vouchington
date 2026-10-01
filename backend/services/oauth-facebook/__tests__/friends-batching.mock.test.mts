import { afterEach, describe, it, vi } from 'vitest'
import {
  assertBoundedStaleFriendCleanup,
  assertFriendsPageCommitsBeforeDeletionFence,
} from '@voucha/test-helpers/services/oauth/friends-batch-sync'
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
    await assertFriendsPageCommitsBeforeDeletionFence({
      provider: 'facebook',
      providerUserIdPrefix: 'fb-batch-',
      firstFriendIdPrefix: 'fb-first-',
      secondFriendIdPrefix: 'fb-second-',
      syncFriends: syncFacebookFriends,
      fetchSpy,
      firstPage: friendId => ({
        data: [{ id: friendId, name: 'First Friend' }],
        paging: { cursors: { after: 'next-page' }, next: 'next-page' },
      }),
      secondPage: friendId => ({
        data: [{ id: friendId, name: 'Second Friend' }],
        paging: {},
      }),
    })
  })

  it('commits each bounded stale-row cleanup page separately', async () => {
    await assertBoundedStaleFriendCleanup({
      provider: 'facebook',
      providerUserIdPrefix: 'fb-batch-',
      staleFriendIdPrefix: 'fb-stale',
      syncFriends: syncFacebookFriends,
      fetchSpy,
      emptyPage: { data: [], paging: {} },
    })
  })
})
