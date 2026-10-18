import { randomUUID } from 'node:crypto'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { upsertBackgroundCpuSchedules } from '@queues/background-cpu/enqueues/schedules'
import { Queue } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { loadBackgroundCpuScheduleManifests } from './background-cpu-schedules.mts'

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

    const manifests = await loadBackgroundCpuScheduleManifests()
    const expected = manifests
      .flatMap(manifest => manifest.jobs.map(job => job.schedulerId))
      .toSorted()
    expect(manifests).toHaveLength(5)

    await upsertBackgroundCpuSchedules(manifests, queue)
    const first = (await queue.getRepeatableJobs()).map(entry => entry.name).toSorted()
    expect(first).toEqual(expected)
    expect(first).toContain('crawl:crawl_hostnames_dispatcher')
    expect(first).toContain('crawl:referral-links-dispatcher')
    expect(first).toContain('crawl:unfurl-referral-links-dispatcher')
    expect(first).toContain('content-analysis:cleanup-abandoned-uploads-schedule')
    expect(first).toContain('bedrock-embeddings:creation-dispatcher')

    await upsertBackgroundCpuSchedules(manifests, queue)
    expect((await queue.getRepeatableJobs()).map(entry => entry.name).toSorted()).toEqual(expected)
  })
})
