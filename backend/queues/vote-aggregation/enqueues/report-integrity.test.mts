import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import {
  enqueueContinueBackfillReportIntegrity,
  enqueueReportIntegrityCheck,
} from './report-integrity.mts'

describe('report integrity enqueues', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('debounces a report integrity check per entity', async () => {
    const add = vi.spyOn(voteAggregation, 'add').mockResolvedValueOnce({ id: 'admitted' } as never)
    const entityId = randomUUID()

    await enqueueReportIntegrityCheck('user', entityId)

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name,
      { entityType: 'user', entityId },
      expect.objectContaining({
        deduplication: expect.objectContaining({
          id: `processReportIntegrityCheck__user__${entityId}`,
          mode: 'debounce',
        }),
      }),
    )
  })

  it('names a backfill continuation by the cursor it resumes from', async () => {
    const add = vi.spyOn(voteAggregation, 'add').mockResolvedValueOnce({ id: 'admitted' } as never)
    const afterId = randomUUID()

    await enqueueContinueBackfillReportIntegrity(afterId)

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB.name,
      { afterId },
      expect.objectContaining({
        jobId: `backfill_report_integrity__${afterId}`,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    )
  })
})
