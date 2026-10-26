import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { openTerminalRetentionQueueForTest } from '@voucha/test-helpers/terminal-retention-queue'
import { createScopedTerminalRetentionProcessorForTest } from '@voucha/test-helpers/terminal-retention-processor'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig } from '@services/data-retention/config'
import {
  getTerminalActivityRetentionJobOptions,
  terminalActivityRetentionJobId,
} from '@queues/psql/enqueues/activitypub-terminal-retention'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('terminal identity family native admission', () => {
  it('retries an ordinary transient failure with the existing PSQL policy', async () => {
    let runs = 0
    const harness = await openTerminalRetentionQueueForTest(async () => {
      runs += 1
      if (runs === 1) throw new Error('transient terminal retention failure')
      return { hasMore: false }
    })
    try {
      const completed = harness.nextTerminal('follow')
      const jobs = await harness.admit(['follow'])
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        ordering: { key: 'psql:terminal-activity-retention:follow', concurrency: 1 },
      })
      await expect(completed).resolves.toBe('completed')
      expect(runs).toBe(2)
      const stored = await harness.queue.getJob(
        terminalActivityRetentionJobId({ family: 'follow' }),
      )
      expect(stored?.attemptsMade).toBe(1)
    } finally {
      await harness.close()
    }
  })

  it('keeps each fixed family ID while active and reactivates it after completion', async () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let followRuns = 0
    const harness = await openTerminalRetentionQueueForTest(async job => {
      if (job.data.family === 'follow' && ++followRuns === 1) {
        entered.resolve()
        await release.promise
      }
    })
    try {
      const first = harness.nextTerminal('follow')
      const like = harness.nextTerminal('like')
      const jobs = await harness.admit(['follow', 'like'])
      expect(jobs.map(job => job.id).toSorted()).toEqual(
        ['follow', 'like'].map(family => `psql__terminal_activity_retention__${family}`).toSorted(),
      )
      await entered.promise
      await expect(harness.admit(['follow'])).resolves.toEqual([])
      await expect(like).resolves.toBe('completed')
      release.resolve()
      await expect(first).resolves.toBe('completed')
      const next = harness.nextTerminal('follow')
      expect(await harness.admit(['follow'])).toHaveLength(1)
      await expect(next).resolves.toBe('completed')
      expect(followRuns).toBe(2)
      expect(getTerminalActivityRetentionJobOptions({ family: 'like' }).ordering).toEqual({
        key: 'psql:terminal-activity-retention:like',
        concurrency: 1,
      })
    } finally {
      release.resolve()
      await harness.close()
    }
  })
  it('yields the actual active job until scoped real terminal pages are drained', async () => {
    const fixture = await createScopedTerminalRetentionProcessorForTest()
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    onTestFinished(restore)
    let attemptsAfterYield = -1
    let runs = 0
    const harness = await openTerminalRetentionQueueForTest(async job => {
      if (++runs === 2) attemptsAfterYield = job.attemptsMade
      return fixture.process(job)
    }, fixture.registerQueueCleanup)
    try {
      const completed = harness.nextTerminal('follow')
      await harness.admit(['follow'])
      await expect(completed).resolves.toBe('completed')
      expect(fixture.pages).toEqual([
        { deleted: 1, hasMore: true },
        { deleted: 1, hasMore: true },
        { deleted: 0, hasMore: false },
      ])
      expect(runs).toBe(3)
      expect(attemptsAfterYield).toBe(0)
      expect((await harness.queue.getJobCounts()).completed).toBe(1)
    } finally {
      await fixture.cleanup()
    }
  })
})
