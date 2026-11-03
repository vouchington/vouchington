import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { enqueueDeleteUserBookmarkBloomFilterBestEffort } from './enqueue-delete-user-bookmark-bloom-filter.mts'

async function readOwnedDeleteJobs(userId: string) {
  const jobs = await readAllQueueJobs(bloomFilters)
  return jobs.filter(
    job =>
      job.name === 'processDeleteUserBookmarkBloomFilter' &&
      (job.data as { userId?: string }).userId === userId,
  )
}

describe('best-effort bookmark deletion enqueue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('awaits completion of the accepted enqueue', async () => {
    const userId = randomUUID()

    await expect(enqueueDeleteUserBookmarkBloomFilterBestEffort(userId)).resolves.toBeUndefined()

    const jobs = await readOwnedDeleteJobs(userId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({ userId })
  })

  it('settles a rejected enqueue without creating a job', async () => {
    const userId = randomUUID()
    const reason = new Error('queue rejected')
    vi.spyOn(bloomFilters, 'add').mockRejectedValueOnce(reason)

    await expect(enqueueDeleteUserBookmarkBloomFilterBestEffort(userId)).resolves.toBeUndefined()

    expect(await readOwnedDeleteJobs(userId)).toEqual([])
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([captured]) => captured === reason),
    ).toHaveLength(1)
  })
})
