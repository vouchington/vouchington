import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { rejectNextBackgroundJobAddForTest } from '@voucha/test-helpers/injected-failures'
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
import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows,
} from './disconnect.mts'
import { withBlueskyDisconnectLock } from './disconnect-lock.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'

const BLUESKY_DISCONNECT_LOCK_NAMESPACE = 0x4253

/** Holds the real per-user disconnect lock until released. */
async function holdDisconnectLock(userId: string) {
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const holder = withBlueskyDisconnectLock(userId, async () => {
    entered.resolve()
    await gate.promise
  })
  void holder.catch(entered.reject)
  let released: Promise<void> | undefined
  const release = () => {
    gate.resolve()
    return (released ??= holder)
  }
  onTestFinished(async () => {
    await Promise.allSettled([release()])
  })
  await entered.promise
  const processId = await getTestPostgresAdvisoryLockHolderProcessId({
    namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE,
    key: userId,
  })
  return { processId, release }
}

describe('Bluesky disconnect serialization', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(async (_client: NodeOAuthClient, did: string) =>
      new BlueskySessionStore().del(did),
    )
  })

  it('serializes accepted cleanup behind the PostgreSQL session lock', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const request = await requestBlueskyDisconnect(user.id)
    const holder = await holdDisconnectLock(user.id)

    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.processId,
        pool: 'advisory',
        lock: { kind: 'advisory', namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE, key: user.id },
        queryMarker: 'withBlueskyDisconnectLock:lock',
        releaseHolder: holder.release,
      },
      async waitForLock => {
        const accepted = disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request)
        await waitForLock(accepted)
        expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
        expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
        await holder.release()
        await accepted
      },
    )

    expect(revokeBlueskySessionMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      linked.bluesky_did,
    )
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
  })

  it('serializes enqueue-failure cleanup behind the same PostgreSQL session lock', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    onTestFinished(
      rejectNextBackgroundJobAddForTest(
        'bluesky-follow-propagation.disconnectRequested',
        new Error('queue unavailable'),
      ),
    )
    const holder = await holdDisconnectLock(user.id)

    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.processId,
        pool: 'advisory',
        lock: { kind: 'advisory', namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE, key: user.id },
        queryMarker: 'withBlueskyDisconnectLock:lock',
        releaseHolder: holder.release,
      },
      async waitForLock => {
        const requested = disconnectBlueskyAccountAndCleanupFollows(user.id)
        await waitForLock(requested)
        expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
        expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
        await holder.release()
        await requested
      },
    )

    expect(revokeBlueskySessionMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      linked.bluesky_did,
    )
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
  })
})
