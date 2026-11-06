import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUrlWithHostname, insertHackerNewsReferencesForTest } from '@voucha/test-helpers'
import { ageHackerNewsLookupsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { hackerNewsFlagsQueue } from '@queues/hacker-news-flags/queues'
import { READMISSION_JOB, getHackerNewsFlagsOrdering } from '@queues/hacker-news-flags/config'
import { hackerNewsWorkConfig } from '@services/urls/hacker-news-work-limits'
import { createHackerNewsFlagsWorker } from '../workers.mts'
import type { Job } from 'glide-mq'

vi.hoisted(() => {
  const url = new URL(
    process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL ?? 'redis://localhost:6379',
  )
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('Hacker News refresh readmission worker', () => {
  it('completes paused readmission and persists a bounded resume cursor on the next scheduled-shaped job', async () => {
    await Promise.all([
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsWorkConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, { lookup_batch_size: 1 }),
    )
    const worker = await createHackerNewsFlagsWorker({ promotionInterval: 1 })
    onTestFinished(async () => {
      await worker.close(true)
      await Promise.all([hackerNewsFlagsQueue.close(), hackerNewsQueue.close()])
      vi.unstubAllEnvs()
    })
    const urlId = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 0, comment_count: 0 })
    await ageHackerNewsLookupsForTest([urlId], new Date(Date.now() - 2 * 86_400_000))
    const hex = (BigInt(`0x${urlId.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
    const afterId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    const run = async () => {
      const id = `hn-readmission-test__${randomUUID()}`
      const pending = Promise.withResolvers<Job>()
      const completed = (job: Job) => {
        if (job.id === id) pending.resolve(job)
      }
      const failed = (job: Job | undefined, error: Error) => {
        if (job?.id === id) pending.reject(error)
      }
      worker!.on('completed', completed)
      worker!.on('failed', failed)
      try {
        await hackerNewsFlagsQueue.add(
          READMISSION_JOB,
          { kind: 'readmission', afterId, upperId: urlId },
          {
            jobId: id,
            ordering: getHackerNewsFlagsOrdering('readmission'),
            removeOnComplete: true,
          },
        )
        return await waitForRealGlideEvent(pending.promise, 'Hacker News readmission completion')
      } finally {
        worker!.off('completed', completed)
        worker!.off('failed', failed)
      }
    }
    const restoreOff = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, {
      lookups_enabled: false,
    })
    try {
      const paused = await run()
      expect(paused.data.afterId).toBe(afterId)
      expect(await hackerNewsQueue.getJob(`hacker-news__${urlId}`)).toBeFalsy()
    } finally {
      restoreOff()
    }
    const completed = await run()
    expect(completed.data.afterId).toBe(urlId)
    expect(completed.data.upperId).toBe(urlId)
    const lookup = await hackerNewsQueue.getJob(`hacker-news__${urlId}`)
    expect(lookup?.data).toEqual({ urlId })
    await lookup?.remove()
  })
})
