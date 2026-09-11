import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestBlueskyLinkedAccount,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows,
} from './disconnect.mts'
import {
  hasPendingBlueskyDisconnect,
  requestBlueskyDisconnect,
  streamPendingBlueskyDisconnectBatches,
  type BlueskyDisconnectRequest,
} from './disconnect-request.mts'
import { enqueueDisconnectRequested } from '@queues/bluesky-follow-propagation/enqueues'
import { BLUESKY_DISCONNECT_LOCK_NAMESPACE } from './disconnect-lock.mts'

describe('durable Bluesky disconnect', () => {
  it('persists and queues the exact generation without synchronous cleanup', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const cleanup =
      vi.fn<
        (
          userId: string,
          exactGeneration: { blueskyDid: string; linkAuthorizationId: string },
        ) => Promise<void>
      >()
    await disconnectBlueskyAccountAndCleanupFollows(user.id, {
      disconnectWithoutLock: cleanup,
    })
    const expected = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    expect(cleanup).not.toHaveBeenCalled()
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    expect(await hasPendingBlueskyDisconnect(expected)).toBe(true)
    const job = (await blueskyFollowPropagation.getJobs('waiting')).find(
      candidate => candidate.name === 'disconnectRequested',
    )
    expect(job?.data).toEqual(expected)
    expect(job?.opts).toMatchObject({
      attempts: 3,
      jobId: `disconnect_${user.id}_${linked.link_authorization_id}`,
      priority: 10,
      deduplication: {
        id: `disconnect_${user.id}_${linked.link_authorization_id}`,
        mode: 'simple',
      },
    })
  })

  it('preserves a durable request and cleans up synchronously when immediate queueing fails', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const enqueue = vi
      .fn<typeof enqueueDisconnectRequested>()
      .mockRejectedValueOnce(new Error('Valkey unavailable'))
    const reportError = vi.fn<(error: Error) => void>()
    const cleanup =
      vi.fn<
        (
          userId: string,
          exactGeneration: { blueskyDid: string; linkAuthorizationId: string },
        ) => Promise<void>
      >()
    const expected = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }

    await disconnectBlueskyAccountAndCleanupFollows(user.id, {
      enqueueDisconnectRequested: enqueue,
      reportError,
      disconnectWithoutLock: cleanup,
    })

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Valkey unavailable' }),
    )
    expect(enqueue).toHaveBeenCalledWith(expected)
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(user.id, expected)
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    expect(await hasPendingBlueskyDisconnect(expected)).toBe(true)
    const pending: BlueskyDisconnectRequest[] = []
    for await (const batch of streamPendingBlueskyDisconnectBatches()) pending.push(...batch)
    expect(pending).toContainEqual(expected)
  })

  it('serializes accepted cleanup for an exact generation', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const generation = {
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    const cleanup = vi
      .fn<
        (
          userId: string,
          exactGeneration: { blueskyDid: string; linkAuthorizationId: string },
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined)
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, generation, {
      disconnectWithoutLock: cleanup,
    })
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(user.id, generation)
  })

  it('serializes enqueue-failure cleanup and accepted cleanup with a PostgreSQL session lock', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const generation = {
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    let releaseRequest!: () => void
    const requestGate = new Promise<void>(resolve => {
      releaseRequest = resolve
    })
    let markRequestEntered!: () => void
    const requestEntered = new Promise<void>(resolve => {
      markRequestEntered = resolve
    })
    const requestCleanup = vi.fn<() => Promise<void>>(async () => {
      markRequestEntered()
      await requestGate
    })
    const acceptedCleanup = vi.fn<() => Promise<void>>(async () => {})

    const requested = disconnectBlueskyAccountAndCleanupFollows(user.id, {
      enqueueDisconnectRequested: vi
        .fn<typeof enqueueDisconnectRequested>()
        .mockRejectedValueOnce(new Error('Valkey unavailable')),
      reportError: vi.fn<(error: Error) => void>(),
      disconnectWithoutLock: requestCleanup,
    })
    await requestEntered
    const requestHolderProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
      namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE,
      key: user.id,
    })
    let accepted: Promise<void> | undefined
    try {
      accepted = disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, generation, {
        disconnectWithoutLock: acceptedCleanup,
      })

      await waitForTestPostgresLockWaiter(requestHolderProcessId, 'withBlueskyDisconnectLock:lock')
      expect(acceptedCleanup).not.toHaveBeenCalled()
      releaseRequest()
      await Promise.all([requested, accepted])
      expect(acceptedCleanup).toHaveBeenCalledWith(user.id, generation)
    } finally {
      releaseRequest()
      await Promise.allSettled(accepted ? [requested, accepted] : [requested])
    }
  })

  it('streams full disconnect batches before the final partial batch', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: first.id })
    await insertTestBlueskyLinkedAccount({ userId: second.id })
    const expected = await Promise.all([
      requestBlueskyDisconnect(first.id),
      requestBlueskyDisconnect(second.id),
    ])

    const batches: BlueskyDisconnectRequest[][] = []
    for await (const batch of streamPendingBlueskyDisconnectBatches(1)) batches.push(batch)

    expect(batches.length).toBeGreaterThanOrEqual(2)
    expect(batches.every(batch => batch.length === 1)).toBe(true)
    expect(batches.flat()).toEqual(expect.arrayContaining(expected))
  })
})
