import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeQueuedJobsById } from '../../../test-helpers/shared-queue-cleanup.mts'
import { MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS } from '../config.mts'
import { memberships } from '../queues.mts'
import { enqueueBulkReconcileMicrosoftStoreSources } from './microsoft-store.mts'

describe('Microsoft Store membership enqueues', () => {
  const created: string[] = []
  afterEach(async () => removeQueuedJobsById(memberships, created.splice(0)))

  it('bulk-enqueues source reconciliation with one recovery bucket and per-source identity', async () => {
    const now = 1_800_000_000_123
    const bucket = Math.floor(now / MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS)
    const sourceIds = [randomUUID(), randomUUID()]
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    let replayed: unknown[] = []
    try {
      await enqueueBulkReconcileMicrosoftStoreSources(sourceIds.map(sourceId => ({ sourceId })))
      // A replayed recovery page in the same bucket is collapsed by the stable job id.
      replayed = await enqueueBulkReconcileMicrosoftStoreSources(
        sourceIds.map(sourceId => ({ sourceId })),
      )
    } finally {
      dateNow.mockRestore()
    }
    expect(replayed).toHaveLength(0)

    for (const sourceId of sourceIds) {
      const jobId = `microsoft-store-source__${sourceId}__${bucket}`
      created.push(jobId)
      expect(await memberships.getJob(jobId)).toMatchObject({
        name: 'memberships.reconcileMicrosoftStoreSource',
        data: { sourceId },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `memberships:microsoft-store-source:${sourceId}`, concurrency: 1 },
        },
      })
    }
  })
})
