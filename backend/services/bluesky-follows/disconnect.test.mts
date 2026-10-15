import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestBlueskyLinkedAccount,
  readEnqueuedJob,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows,
} from './disconnect.mts'
import {
  hasPendingBlueskyDisconnect,
  requestBlueskyDisconnect,
  listPendingBlueskyDisconnectPage,
  type BlueskyDisconnectRequest,
} from './disconnect-request.mts'
import { enqueueDisconnectRequested } from '@queues/bluesky-follow-propagation/enqueues'
import { BLUESKY_DISCONNECT_LOCK_NAMESPACE } from './disconnect-lock.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('durable Bluesky disconnect', () => {
  it('persists and queues the exact generation without synchronous cleanup', async () => {
    const unrelated = {
      userId: randomUUID(),
      blueskyDid: `did:plc:${randomUUID()}`,
      linkAuthorizationId: randomUUID(),
    }
    const unrelatedEnqueued = await enqueueDisconnectRequested(unrelated)
    const unrelatedJob = await readEnqueuedJob(blueskyFollowPropagation, unrelatedEnqueued)
    const unrelatedJobOptions = structuredClone(unrelatedJob.opts)
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
    const jobId = `disconnect_${user.id}_${linked.link_authorization_id}`
    const job = await blueskyFollowPropagation.getJob(jobId)
    expect(job?.name).toBe('bluesky-follow-propagation.disconnectRequested')
    expect(job?.data).toEqual(expected)
    expect(job?.opts).toMatchObject({
      attempts: 3,
      jobId,
      priority: 10,
      // The domain-wide group serializes every Bluesky-token job across replicas.
      ordering: { key: 'bluesky-follow-propagation', concurrency: 1 },
      deduplication: {
        id: jobId,
        mode: 'simple',
      },
    })
    expect(await readEnqueuedJob(blueskyFollowPropagation, unrelatedEnqueued)).toMatchObject({
      id: unrelatedJob.id,
      name: 'bluesky-follow-propagation.disconnectRequested',
      data: unrelated,
      opts: unrelatedJobOptions,
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
    expect(await listPendingFrom(uuidBefore(linked.link_authorization_id))).toContainEqual(expected)
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

  it('pages pending disconnects by authorization id, never over the page size, covering each once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: first.id })
    await insertTestBlueskyLinkedAccount({ userId: second.id })
    const expected = await Promise.all([
      requestBlueskyDisconnect(first.id),
      requestBlueskyDisconnect(second.id),
    ])
    const ids = expected.map(request => request.linkAuthorizationId).toSorted()

    const seen: BlueskyDisconnectRequest[] = []
    let afterId: string | undefined = uuidBefore(ids[0]!)
    for (;;) {
      const page = await listPendingBlueskyDisconnectPage(afterId)
      expect(page.requests.length).toBeLessThanOrEqual(1)
      expect(page.hasMore).toBe(page.requests.length === 1)
      seen.push(...page.requests)
      if (
        !page.hasMore ||
        ids.every(id => seen.some(request => request.linkAuthorizationId === id))
      )
        break
      afterId = page.requests.at(-1)!.linkAuthorizationId
    }

    const authorizationIds = seen.map(request => request.linkAuthorizationId)
    expect(authorizationIds).toEqual(authorizationIds.toSorted())
    expect(new Set(authorizationIds).size).toBe(authorizationIds.length)
    expect(seen).toEqual(expect.arrayContaining(expected))
  })
})

async function listPendingFrom(afterId: string): Promise<BlueskyDisconnectRequest[]> {
  const pending: BlueskyDisconnectRequest[] = []
  let cursor: string | undefined = afterId
  for (;;) {
    const page = await listPendingBlueskyDisconnectPage(cursor)
    pending.push(...page.requests)
    if (!page.hasMore) return pending
    cursor = page.requests.at(-1)!.linkAuthorizationId
  }
}
