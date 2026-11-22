import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'

const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { BlueskySessionStore } from '../bluesky-accounts/session-store.mts'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'

describe('concurrent Bluesky disconnect', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(async (_client: NodeOAuthClient, did: string) =>
      new BlueskySessionStore().del(did),
    )
  })

  it('removes the account once when the job races its inline fallback', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const request = await requestBlueskyDisconnect(user.id)

    const results = await Promise.allSettled([
      disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request),
      disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request),
    ])

    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
    expect(results.filter(result => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    // The exact-generation delete matches one row, so the loser either found no account or failed
    // closed with the lifecycle conflict that the queue retries as a no-op.
    const unexpected = results
      .flatMap(result => (result.status === 'rejected' ? [String(result.reason)] : []))
      .filter(reason => !/lifecycle/i.test(reason))
    expect(unexpected).toEqual([])
  })
})
