import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { hasTestPendingBlueskyDisconnect } from '@voucha/test-helpers/bluesky-disconnect-readers'
import { backgroundQueue as blueskyFollowPropagation } from '@voucha/test-helpers/shared-background-queue'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import { disconnectBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import {
  requestBlueskyDisconnect,
  listPendingBlueskyDisconnectPage,
} from './disconnect-request.mts'
type BlueskyDisconnectRequest = Awaited<ReturnType<typeof requestBlueskyDisconnect>>

import { enqueueDisconnectRequested } from '@queues/bluesky-follow-propagation/enqueues'
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
    await disconnectBlueskyAccountAndCleanupFollows(user.id)
    const expected = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
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
