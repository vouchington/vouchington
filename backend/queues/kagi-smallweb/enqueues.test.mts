import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { KagiFeedJobData } from './types.mts'
import { enqueueBulkProcessKagiFeeds, enqueueKagiSmallWebSync } from './enqueues.mts'
import { kagiSmallWeb } from './queues.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('enqueueKagiSmallWebSync', () => {
  it('lands a sync job in the waiting state', async () => {
    // Filtering only by the shared 'sync' job name can match an unrelated sync job already
    // present in the singleton in-memory queue (e.g. from a scheduled-job route test sharing
    // an `isolate: false` Vitest fork, or a prior watch rerun). Supply a unique deduplication
    // ID so this test identifies only the job this call created.
    const deduplicationId = `kagi-smallweb-sync-test-${randomUUID()}`

    await enqueueKagiSmallWebSync({ deduplicationId })

    const waiting = await kagiSmallWeb.getJobs('waiting')
    const jobs = waiting.filter(j => j.opts.deduplication?.id === deduplicationId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.name).toBe('sync')
  })
})

describe('enqueueBulkProcessKagiFeeds', () => {
  it('enqueues feed entries to Valkey and lands one job per entry', async () => {
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

    const waiting = await kagiSmallWeb.getJobs('waiting')
    const jobs = waiting.filter(j => (j.data as KagiFeedJobData).feedUrl === feedUrl)
    expect(jobs).toHaveLength(1)
  })
})
