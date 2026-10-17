import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import {
  enqueueRecoverUserDeletions,
  enqueueUserDeletion,
  userDeletionJobId,
} from './user-deletions.mts'
import { accountLifecycle } from '../queues.mts'

describe('user-deletions enqueues', () => {
  it('uses the request and processing attempt as the stable job identity', async () => {
    const data = { requestId: randomUUID(), processingAttemptId: randomUUID() }
    const expectedId = `user-deletion__${data.requestId}__${data.processingAttemptId}`

    await enqueueUserDeletion(data)

    expect(userDeletionJobId(data)).toBe(expectedId)
    await expect(readEnqueuedJob(accountLifecycle, { id: expectedId })).resolves.toMatchObject({
      id: expectedId,
      name: 'account-lifecycle.processUserDeletion',
      data,
      opts: {
        deduplication: { id: expectedId, mode: 'simple' },
        priority: 10,
        lockDuration: 600_000,
        ordering: { key: 'account-lifecycle', concurrency: 2 },
      },
    })
  })

  it('delays a leased-attempt successor without adding scheduling data to its payload', async () => {
    const data = {
      requestId: randomUUID(),
      processingAttemptId: randomUUID(),
      delayMs: 60_000,
    }
    const expectedId = `user-deletion__${data.requestId}__${data.processingAttemptId}`

    await enqueueUserDeletion(data)

    await expect(readEnqueuedJob(accountLifecycle, { id: expectedId })).resolves.toMatchObject({
      data: { requestId: data.requestId, processingAttemptId: data.processingAttemptId },
      opts: { delay: 60_000 },
    })
  })

  it('deduplicates recovery dispatches within the recovery window', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-07T12:02:00Z') })
    try {
      const first = await enqueueRecoverUserDeletions()
      const second = await enqueueRecoverUserDeletions()

      expect(first).not.toBeNull()
      expect(second).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
