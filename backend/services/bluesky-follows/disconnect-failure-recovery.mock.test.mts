import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
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

import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import { BlueskySessionStore } from '../bluesky-accounts/session-store.mts'
import { disconnectBlueskyAccountAndCleanupFollows as disconnectBlueskyAccountAndEnqueue } from './disconnect.mts'
import { hasPendingBlueskyDisconnect } from './disconnect-request.mts'
import { getBlueskyFollowReceipt, saveBlueskyFollowReceipt } from './receipts.mts'

async function disconnectBlueskyAccountAndCleanupFollows(userId: string): Promise<void> {
  return disconnectBlueskyAccountAndEnqueue(userId, {
    enqueueDisconnectRequested: async () => {
      throw new Error('queue unavailable')
    },
    reportError: () => undefined,
  })
}

describe('synchronous Bluesky disconnect failure recovery', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(
      async (_client: NodeOAuthClient, did: string) => await new BlueskySessionStore().del(did),
    )
  })

  it('keeps failed intent durable, clears another follower receipt, and succeeds on retry', async () => {
    const user = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const followerAccount = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await saveBlueskyFollowReceipt(
      follower.id,
      user.id,
      followerAccount.bluesky_did,
      followerAccount.link_authorization_id,
      `at://${followerAccount.bluesky_did}/app.bsky.graph.follow/${createRandomString(13)}`,
    )
    revokeBlueskySessionMock.mockRejectedValueOnce(new Error('provider revoke failed'))
    const generation = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }

    await expect(disconnectBlueskyAccountAndCleanupFollows(user.id)).rejects.toThrow(
      /provider revoke failed/,
    )

    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
    expect(await hasPendingBlueskyDisconnect(generation)).toBe(true)
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        user.id,
        followerAccount.bluesky_did,
        followerAccount.link_authorization_id,
      ),
    ).toBeNull()

    await disconnectBlueskyAccountAndCleanupFollows(user.id)

    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
    expect(await hasPendingBlueskyDisconnect(generation)).toBe(false)
  })
})
