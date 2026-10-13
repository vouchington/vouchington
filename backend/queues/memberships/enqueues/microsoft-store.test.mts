import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS } from '../config.mts'
import { memberships } from '../queues.mts'
import { enqueueBulkReconcileMicrosoftStoreSources } from './microsoft-store.mts'

const queueStates = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const
const queuedJobs = async () =>
  (await Promise.all(queueStates.map(state => memberships.getJobs(state)))).flat()

describe('Microsoft Store membership enqueues', () => {
  afterEach(() => memberships.obliterate({ force: true }))

  it('bulk-enqueues source reconciliation with one recovery bucket and per-source identity', async () => {
    const now = 1_800_000_000_123
    const bucket = Math.floor(now / MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS)
    const sourceIds = [randomUUID(), randomUUID()]
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await enqueueBulkReconcileMicrosoftStoreSources(sourceIds.map(sourceId => ({ sourceId })))
      // A replayed recovery page in the same bucket is collapsed by the stable job id.
      await enqueueBulkReconcileMicrosoftStoreSources(sourceIds.map(sourceId => ({ sourceId })))
    } finally {
      dateNow.mockRestore()
    }
    const jobs = await queuedJobs()

    for (const sourceId of sourceIds) {
      const jobId = `microsoft-store-source__${sourceId}__${bucket}`
      expect(jobs.filter(job => job.id === jobId)).toHaveLength(1)
      expect(jobs.find(job => job.id === jobId)).toMatchObject({
        data: { sourceId },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `microsoft-store-source:${sourceId}`, concurrency: 1 },
        },
      })
    }
  })
})
