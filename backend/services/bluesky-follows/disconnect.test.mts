import { randomUUID } from 'node:crypto'
import { withTestOwnedAdvisoryWait } from '@voucha/test-helpers/advisory-client-lock-observer'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestBlueskyLinkedAccount,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { hasTestPendingBlueskyDisconnect } from '@voucha/test-helpers/bluesky-disconnect-readers'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows,
} from './disconnect.mts'
import {
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
    expect(await hasTestPendingBlueskyDisconnect(expected)).toBe(true)
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
    expect(await hasTestPendingBlueskyDisconnect(expected)).toBe(true)
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
    const requestGate = Promise.withResolvers<void>()
    const requestEntered = Promise.withResolvers<void>()
    const requestCleanup = vi.fn<() => Promise<void>>(async () => {
      requestEntered.resolve()
      await requestGate.promise
    })
    const acceptedCleanup = vi.fn<() => Promise<void>>(async () => {})

    const requested = disconnectBlueskyAccountAndCleanupFollows(user.id, {
      enqueueDisconnectRequested: vi
        .fn<typeof enqueueDisconnectRequested>()
        .mockRejectedValueOnce(new Error('Valkey unavailable')),
      reportError: vi.fn<(error: Error) => void>(),
      disconnectWithoutLock: requestCleanup,
    })
    void requested.catch(requestEntered.reject)
    let managed = false
    let holderRelease: Promise<void> | undefined
    const releaseHolder = () => {
      requestGate.resolve()
      return (holderRelease ??= requested)
    }
    onTestFinished(async () => {
      if (managed) await Promise.allSettled([releaseHolder()])
      else await releaseHolder()
    })
    await requestEntered.promise
    const requestHolderProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
      namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE,
      key: user.id,
    })
    managed = true
    await withTestOwnedAdvisoryWait(
      {
        holderProcessId: requestHolderProcessId,
        namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE,
        key: user.id,
        queryMarker: 'withBlueskyDisconnectLock:lock',
        releaseHolder,
      },
      async waitForLock => {
        const accepted = disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, generation, {
          disconnectWithoutLock: acceptedCleanup,
        })
        await waitForLock(accepted)
        expect(acceptedCleanup).not.toHaveBeenCalled()
        await releaseHolder()
        await accepted
        expect(acceptedCleanup).toHaveBeenCalledWith(user.id, generation)
      },
    )
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

  it('starts from the first authorization id when no cursor is given', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const user = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: user.id })
    await requestBlueskyDisconnect(user.id)

    const page = await listPendingBlueskyDisconnectPage()

    expect(page.requests).toHaveLength(1)
    expect(page.hasMore).toBe(true)
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
