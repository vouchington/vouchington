import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { partitionCleanupConfig } from '@queues/psql/config'
import { psql } from '@queues/psql/queues'
import type { cleanupPartitions as cleanupPartitionsService } from '@data-stores/psql/migration-runner/monthly-partitions'
import processPsql from '../processors.mts'

const continuationJobId = (rootJobId: string, step: number) =>
  `psql__partition-cleanup__${rootJobId}__${step}`

function removeContinuationOnFinish(rootJobId: string, steps: number[]) {
  onTestFinished(async () => {
    await Promise.all(
      steps.map(async step => (await psql.getJob(continuationJobId(rootJobId, step)))?.remove()),
    )
  })
}

describe('monthly partition cleanup continuation', () => {
  it('starts the first continuation from the original job and freezes its reference date', async () => {
    const jobId = `partition-cleanup-${randomUUID()}`
    const next = { priority: 2, partition: 'topic_revisions__p_2025_09' }
    const cleanup = vi
      .fn<typeof cleanupPartitionsService>()
      .mockResolvedValue({ outcomes: [], hasMore: true, nextCursor: next })
    const rootJobId = createHash('sha256').update(jobId).digest('hex')
    removeContinuationOnFinish(rootJobId, [1])

    await processPsql('cleanupPartitions', {}, { cleanupPartitions: cleanup }, jobId)

    const referenceDate = cleanup.mock.calls[0]?.[0]
    expect(referenceDate).toBeInstanceOf(Date)
    expect((await psql.getJob(continuationJobId(rootJobId, 1)))?.data).toEqual({
      partitionContinuation: {
        rootJobId,
        step: 1,
        referenceDate: referenceDate!.toISOString(),
        after: next,
      },
    })
  })

  it('rejects an invalid continuation date before reading candidates', async () => {
    const cleanup = vi.fn<typeof cleanupPartitionsService>()
    const rootJobId = randomUUID()
    removeContinuationOnFinish(rootJobId, [2])
    await expect(
      processPsql(
        'cleanupPartitions',
        {
          partitionContinuation: {
            rootJobId,
            step: 1,
            referenceDate: 'invalid-date',
            after: { priority: 2, partition: 'topic_revisions__p_2025_09' },
          },
        },
        { cleanupPartitions: cleanup },
        'partition-cleanup-invalid-date',
      ),
    ).rejects.toThrow('Invalid partition cleanup reference date')
    expect(cleanup).not.toHaveBeenCalled()
    expect(await psql.getJob(continuationJobId(rootJobId, 2))).toBeFalsy()
  })

  it.each([
    {
      missing: 'job ID',
      jobId: undefined,
      nextCursor: { priority: 2, partition: 'topic_revisions__p_2025_09' },
    },
    {
      missing: 'cursor',
      jobId: `partition-cleanup-without-cursor-${randomUUID()}`,
      nextCursor: undefined,
    },
  ])('rejects when hasMore has no $missing', async ({ jobId, nextCursor }) => {
    const cleanup = vi
      .fn<typeof cleanupPartitionsService>()
      .mockResolvedValue({ outcomes: [], hasMore: true, nextCursor })
    const rootJobId = createHash('sha256')
      .update(jobId ?? '')
      .digest('hex')
    removeContinuationOnFinish(rootJobId, [1])
    await expect(
      processPsql('cleanupPartitions', {}, { cleanupPartitions: cleanup }, jobId),
    ).rejects.toThrow('Partition cleanup continuation needs a job ID and cursor')
    expect(await psql.getJob(continuationJobId(rootJobId, 1))).toBeFalsy()
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
    const continuation = {
      rootJobId: randomUUID(),
      step: 1,
      referenceDate: '2026-10-28T00:00:00.000Z',
      after,
    }
    removeContinuationOnFinish(continuation.rootJobId, [2, 3])

    await processPsql(
      'cleanupPartitions',
      { partitionContinuation: continuation },
      { cleanupPartitions: cleanup },
      'partition-cleanup-current',
    )
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(new Date(continuation.referenceDate), {
      feedbackBatchSize: expect.any(Number),
      limit: 1,
      after,
    })
    expect((await psql.getJob(continuationJobId(continuation.rootJobId, 2)))?.data).toEqual({
      partitionContinuation: { ...continuation, step: 2, after: next },
    })

    await processPsql(
      'cleanupPartitions',
      { partitionContinuation: { ...continuation, step: 2, after: next } },
      { cleanupPartitions: cleanup },
      'partition-cleanup-next',
    )
    expect(await psql.getJob(continuationJobId(continuation.rootJobId, 3))).toBeFalsy()
  })
})
