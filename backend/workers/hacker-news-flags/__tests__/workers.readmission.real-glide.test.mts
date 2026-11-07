import type { LookupReadmissionWindow } from '@queues/hacker-news-flags/types'
import { createReadmissionFirstPageFailureForTest } from '@voucha/test-helpers/hacker-news-readmission-failure'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
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
  afterAll(async () => {
    await Promise.all([hackerNewsFlagsQueue.close(), hackerNewsQueue.close()])
    vi.unstubAllEnvs()
  })
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
    })
    const urlId = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 0, comment_count: 0 })
    await ageHackerNewsLookupsForTest([urlId], new Date(Date.now() - 2 * 86_400_000))
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
          { kind: 'readmission', urlIds: [urlId] },
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
      expect(paused.data.after).toBeUndefined()
      expect(paused.data.window).toBeUndefined()
      expect(await hackerNewsQueue.getJob(`hacker-news__${urlId}`)).toBeFalsy()
    } finally {
      restoreOff()
    }
    const completed = await run()
    expect(completed.data.after?.urlId).toBe(urlId)
    expect(completed.data.window.cutoff).toBe(
      new Date(completed.data.window.decisionInstant - 24 * 3_600_000).toISOString(),
    )
    const lookup = await hackerNewsQueue.getJob(`hacker-news__${urlId}`)
    expect(lookup?.data).toEqual({ urlId })
    await lookup?.remove()
  })
  it('persists the initial decision window before a real first-page retry without advancing the cursor', async () => {
    await Promise.all([
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsWorkConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: true }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
        lookup_batch_size: 1,
        recent_refresh_hours: 1,
        middle_refresh_hours: 1,
        older_refresh_hours: 1,
      }),
    )
    const urlId = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 0, comment_count: 0 })
    await ageHackerNewsLookupsForTest([urlId], new Date(Date.now() - 3 * 3_600_000))
    const id = `hn-readmission-retry__${randomUUID()}`
    let snapshot: LookupReadmissionWindow | undefined
    let restoreRetryConfig: (() => void) | undefined
    const fault = createReadmissionFirstPageFailureForTest(async (attempt, cutoff) => {
      const persisted = await hackerNewsFlagsQueue.getJob(id)
      expect(persisted?.data.kind).toBe('readmission')
      if (!persisted || persisted.data.kind !== 'readmission')
        throw new Error('Expected retained readmission job')
      expect(persisted.data.window).toBeDefined()
      expect(persisted.data.after === undefined).toBe(attempt <= 2)
      if (attempt === 1) {
        snapshot = structuredClone(persisted.data.window)
        restoreRetryConfig = overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
          recent_refresh_hours: 2,
          middle_refresh_hours: 2,
          older_refresh_hours: 2,
        })
      }
      expect(persisted.data.window).toEqual(snapshot)
      expect(cutoff).toBe(snapshot?.cutoff)
    })
    const worker = await createHackerNewsFlagsWorker({
      promotionInterval: 1,
      readmissionOptions: { query: fault.query },
    })
    onTestFinished(async () => {
      await worker.close(true)
      await (await hackerNewsQueue.getJob(`hacker-news__${urlId}`))?.remove()
    })
    const pending = Promise.withResolvers<Job>()
    let failures = 0
    const completed = (job: Job) => {
      if (job.id === id) pending.resolve(job)
    }
    const failed = (job: Job | undefined, error: Error) => {
      if (job?.id !== id) return
      failures += 1
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) pending.reject(error)
    }
    worker.on('completed', completed)
    worker.on('failed', failed)
    try {
      await hackerNewsFlagsQueue.add(
        READMISSION_JOB,
        { kind: 'readmission', urlIds: [urlId] },
        {
          jobId: id,
          attempts: 2,
          backoff: { type: 'fixed', delay: 1 },
          ordering: getHackerNewsFlagsOrdering('readmission'),
          removeOnComplete: true,
        },
      )
      const job = await waitForRealGlideEvent(
        pending.promise,
        'Hacker News first-page retry completion',
      )
      expect(failures).toBe(1)
      expect(fault.pageCalls()).toBeGreaterThanOrEqual(2)
      expect(job.data.window).toEqual(snapshot)
      expect(job.data.after?.urlId).toBe(urlId)
      expect((await hackerNewsQueue.getJob(`hacker-news__${urlId}`))?.data).toEqual({ urlId })
    } finally {
      restoreRetryConfig?.()
      worker.off('completed', completed)
      worker.off('failed', failed)
    }
  })
})
