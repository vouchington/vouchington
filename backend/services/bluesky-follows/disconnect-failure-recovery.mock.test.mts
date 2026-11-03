import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'

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
import { hasTestPendingBlueskyDisconnect } from '@voucha/test-helpers/bluesky-disconnect-readers'
import { rejectNextBackgroundJobAddForTest } from '@voucha/test-helpers/injected-failures'
import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows as disconnectBlueskyAccountAndEnqueue,
} from './disconnect.mts'
import { getBlueskyFollowReceipt, saveBlueskyFollowReceipt } from './receipts.mts'
import { listPendingBlueskyDisconnectPage } from './disconnect-request.mts'

async function disconnectBlueskyAccountAndCleanupFollows(userId: string): Promise<void> {
  const restore = rejectNextBackgroundJobAddForTest(
    'bluesky-follow-propagation.disconnectRequested',
    new Error('queue unavailable'),
  )
  try {
    return await disconnectBlueskyAccountAndEnqueue(userId)
  } finally {
    restore()
  }
}

describe('synchronous Bluesky disconnect failure recovery', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(async (_client: NodeOAuthClient, did: string) =>
      new BlueskySessionStore().del(did),
    )
  })

  it('keeps failed intent durable, clears another follower receipt, and succeeds on worker retry', async () => {
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

    await expect(disconnectBlueskyAccountAndCleanupFollows(user.id)).resolves.toBeUndefined()
    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)

    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
    expect(await hasTestPendingBlueskyDisconnect(generation)).toBe(true)
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        user.id,
        followerAccount.bluesky_did,
        followerAccount.link_authorization_id,
      ),
    ).toBeNull()

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, generation)

    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
    expect(await hasTestPendingBlueskyDisconnect(generation)).toBe(false)
  })
  it('reports the failed queueing, keeps the request durable, and cleans up synchronously', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    revokeBlueskySessionMock.mockRejectedValueOnce(new Error('provider revoke failed'))
    const expected = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    onTestFinished(
      rejectNextBackgroundJobAddForTest(
        'bluesky-follow-propagation.disconnectRequested',
        new Error('Valkey unavailable'),
      ),
    )

    await disconnectBlueskyAccountAndEnqueue(user.id)

    expect(
      sentryCaptureExceptionMock.mock.calls.map(([error]) => (error as Error).message),
    ).toContain('Valkey unavailable')
    expect(revokeBlueskySessionMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      linked.bluesky_did,
    )
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
    expect(await hasTestPendingBlueskyDisconnect(expected)).toBe(true)
    expect(await listPendingFrom(uuidBefore(linked.link_authorization_id))).toContainEqual(expected)
  })
})

async function listPendingFrom(afterId: string) {
  const pending = []
  let cursor: string | undefined = afterId
  for (;;) {
    const page = await listPendingBlueskyDisconnectPage(cursor)
    pending.push(...page.requests)
    if (!page.hasMore) return pending
    cursor = page.requests.at(-1)!.linkAuthorizationId
  }
}
