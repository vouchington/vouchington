import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
  type KagiFeedJobData,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import {
  enqueueBulkProcessKagiFeeds,
  enqueueKagiSmallWebSync,
  enqueueKagiSmallWebSyncContinuation,
} from './enqueues.mts'
import { kagiSmallWeb } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('enqueueKagiSmallWebSync', () => {
  it('lands a sync job in the dispatcher lane', async () => {
    // Supply a unique deduplication ID so this test identifies only the job this call created
    // among the other domains' jobs in the shared queue.
    const deduplicationId = `kagi-smallweb-sync-test-${randomUUID()}`

    await enqueueKagiSmallWebSync({ deduplicationId })

    const waiting = await readAllQueueJobs(kagiSmallWeb)
    const jobs = waiting.filter(j => j.opts.deduplication?.id === deduplicationId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.name).toBe(KAGI_SMALLWEB_SYNC_JOB.name)
    expect(jobs[0]?.opts).toMatchObject({
      priority: 100,
      ordering: { key: 'kagi-smallweb:dispatcher', concurrency: 1 },
    })
  })
})

describe('enqueueKagiSmallWebSyncContinuation', () => {
  it('carries the cursor and uses a digest of it as the job id', async () => {
    const cursor = `https://kagi-cursor-${randomSuffix()}.example.com/feed.xml`
    const jobId = `kagi_smallweb_sync__${createHash('sha256').update(cursor).digest('hex')}`

    await enqueueKagiSmallWebSyncContinuation(cursor)
    await enqueueKagiSmallWebSyncContinuation(cursor)

    const job = await kagiSmallWeb.getJob(jobId)
    expect(job?.data).toEqual({ cursor })
    expect(job?.name).toBe(KAGI_SMALLWEB_SYNC_JOB.name)
    expect(job?.opts).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
      ordering: { key: 'kagi-smallweb:dispatcher' },
    })
    await job?.remove()
  })
})

describe('enqueueBulkProcessKagiFeeds', () => {
  it('enqueues feed entries to Valkey and lands one job per entry in the process lane', async () => {
    const suffix = randomSuffix()
    const feedUrl = `https://kagi-enqueue-test-${suffix}.example.com/feed.xml`
    const entries: KagiFeedJobData[] = [
      {
        feedUrl,
        name: `Kagi Enqueue Test ${suffix}`,
        slug: `kagi-enqueue-test-${suffix}-example-com`,
        sourceType: 'web',
      },
    ]
    await enqueueBulkProcessKagiFeeds(entries)

    const waiting = await readAllQueueJobs(kagiSmallWeb)
    const jobs = waiting.filter(
      j =>
        j.name === KAGI_SMALLWEB_PROCESS_FEED_JOB.name &&
        (j.data as KagiFeedJobData).feedUrl === feedUrl,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.opts).toMatchObject({
      priority: 10,
      ordering: { key: 'kagi-smallweb', concurrency: 5 },
    })
  })
})
