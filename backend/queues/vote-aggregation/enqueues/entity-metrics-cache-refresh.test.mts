import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import { enqueueBulkRefreshPostMetricsById } from './entity-metrics-cache-refresh.mts'

describe('entity metrics cache refresh enqueues', () => {
  it('refreshes metrics at the requested priority', async () => {
    const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockResolvedValueOnce([])
    const id = randomUUID()

    try {
      await enqueueBulkRefreshPostMetricsById([id], 41)

      expect(addBulk).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          name: VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB.name,
          data: { id },
          opts: expect.objectContaining({ priority: 41 }),
        }),
      ])
    } finally {
      addBulk.mockRestore()
    }
  })
})
