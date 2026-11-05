import { randomUUID } from 'node:crypto'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { scheduledJobManifest as crawlDispatch } from '@queues/crawl-dispatch/enqueues/schedules'
import { scheduledJobManifest as crawlReferral } from '@queues/crawl-referral-links/enqueues/schedules'
import { scheduledJobManifest as crawlUnfurl } from '@queues/unfurl-referral-links/enqueues/schedules'
import { scheduledJobManifest as contentAnalysis } from '@queues/content-analysis/enqueues/schedules'
import { scheduledJobManifest as bedrock } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { Queue } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { upsertBackgroundCpuSchedules } from './background-cpu-schedules.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('background-cpu schedules', () => {
  it('keeps every domain scheduler after registration and an idempotent rerun', async () => {
    const queue = new Queue(`background-cpu-schedules-${randomUUID()}`, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    onTestFinished(async () => {
      try {
        await queue.obliterate({ force: true })
      } finally {
        await queue.close()
      }
    })

    const manifests = [crawlDispatch, crawlReferral, crawlUnfurl, contentAnalysis, bedrock]
    const expected = manifests
      .flatMap(manifest => manifest.jobs.map(job => job.schedulerId))
      .toSorted()
    await queue.upsertJobScheduler(
      'crawl:obsolete-dispatch',
      { pattern: '0 * * * *' },
      { name: 'crawl:obsolete-dispatch', data: {} },
    )
    expect((await queue.getRepeatableJobs()).map(entry => entry.name)).toEqual([
      'crawl:obsolete-dispatch',
    ])

    await upsertBackgroundCpuSchedules(queue)
    const first = (await queue.getRepeatableJobs()).map(entry => entry.name).toSorted()
    expect(first).toEqual(expected)
    expect(first).toContain('crawl:crawl_hostnames_dispatcher')
    expect(first).toContain('crawl:referral-links-dispatcher')
    expect(first).toContain('crawl:unfurl-referral-links-dispatcher')
    expect(first).toContain('content-analysis:cleanup-abandoned-uploads-schedule')
    expect(first).toContain('bedrock-embeddings:creation-dispatcher')

    await upsertBackgroundCpuSchedules(queue)
    expect((await queue.getRepeatableJobs()).map(entry => entry.name).toSorted()).toEqual(expected)
  })
})
