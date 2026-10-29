import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { partitionCleanupConfig } from '@queues/psql/config'
import type { cleanupPartitions as cleanupPartitionsService } from '@data-stores/psql/migration-runner/monthly-partitions'
import processPsql from '../processors.mts'

describe('monthly partition cleanup continuation', () => {
  it('starts the first continuation from the original job and freezes its reference date', async () => {
    const jobId = `partition-cleanup-${randomUUID()}`
    const next = { priority: 2, partition: 'topic_revisions__p_2025_09' }
    const cleanup = vi
      .fn<typeof cleanupPartitionsService>()
      .mockResolvedValue({ outcomes: [], hasMore: true, nextCursor: next })
    const enqueue = vi.fn<() => Promise<null>>(async () => null)

    await processPsql(
      'cleanupPartitions',
      {},
      { cleanupPartitions: cleanup, enqueueCleanupPartitionsContinuation: enqueue },
      jobId,
    )

    const referenceDate = cleanup.mock.calls[0]?.[0]
    expect(referenceDate).toBeInstanceOf(Date)
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({
      rootJobId: createHash('sha256').update(jobId).digest('hex'),
      step: 1,
      referenceDate: referenceDate!.toISOString(),
      after: next,
    })
  })

  it('rejects an invalid continuation date before reading candidates', async () => {
    const cleanup = vi.fn<typeof cleanupPartitionsService>()
    const enqueue = vi.fn<() => Promise<null>>(async () => null)
    await expect(
      processPsql(
        'cleanupPartitions',
        {
          partitionContinuation: {
            rootJobId: randomUUID(),
            step: 1,
            referenceDate: 'invalid-date',
            after: { priority: 2, partition: 'topic_revisions__p_2025_09' },
          },
        },
        { cleanupPartitions: cleanup, enqueueCleanupPartitionsContinuation: enqueue },
        'partition-cleanup-invalid-date',
      ),
    ).rejects.toThrow('Invalid partition cleanup reference date')
    expect(cleanup).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it.each([
    {
      missing: 'job ID',
      jobId: undefined,
      nextCursor: { priority: 2, partition: 'topic_revisions__p_2025_09' },
    },
    { missing: 'cursor', jobId: 'partition-cleanup-without-cursor', nextCursor: undefined },
  ])('rejects when hasMore has no $missing', async ({ jobId, nextCursor }) => {
    const cleanup = vi
      .fn<typeof cleanupPartitionsService>()
      .mockResolvedValue({ outcomes: [], hasMore: true, nextCursor })
    const enqueue = vi.fn<() => Promise<null>>(async () => null)
    await expect(
      processPsql(
        'cleanupPartitions',
        {},
        { cleanupPartitions: cleanup, enqueueCleanupPartitionsContinuation: enqueue },
        jobId,
      ),
    ).rejects.toThrow('Partition cleanup continuation needs a job ID and cursor')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('caps each run and keeps its cursor and reference date across jobs', async () => {
    const restore = overrideDynamicConfigFieldsForTest(partitionCleanupConfig, {
      max_partitions_per_run: 1,
    })
    onTestFinished(restore)
    const after = { priority: 2, partition: 'topic_revisions__p_2025_09' }
    const next = { priority: 2, partition: 'topic_revisions__p_2025_10' }
    const cleanup = vi
      .fn<typeof cleanupPartitionsService>()
      .mockResolvedValueOnce({ outcomes: [], hasMore: true, nextCursor: next })
      .mockResolvedValueOnce({ outcomes: [], hasMore: false })
    const enqueue = vi.fn<() => Promise<null>>(async () => null)
    const continuation = {
      rootJobId: randomUUID(),
      step: 1,
      referenceDate: '2026-10-28T00:00:00.000Z',
      after,
    }

    await processPsql(
      'cleanupPartitions',
      { partitionContinuation: continuation },
      { cleanupPartitions: cleanup, enqueueCleanupPartitionsContinuation: enqueue },
      'partition-cleanup-current',
    )
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(new Date(continuation.referenceDate), {
      limit: 1,
      after,
    })
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({
      ...continuation,
      step: 2,
      after: next,
    })

    await processPsql(
      'cleanupPartitions',
      { partitionContinuation: { ...continuation, step: 2, after: next } },
      { cleanupPartitions: cleanup, enqueueCleanupPartitionsContinuation: enqueue },
      'partition-cleanup-next',
    )
    expect(enqueue).toHaveBeenCalledOnce()
  })
})
