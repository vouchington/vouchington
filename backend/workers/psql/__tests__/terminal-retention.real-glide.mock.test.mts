import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { openTerminalRetentionQueueForTest } from '@voucha/test-helpers/terminal-retention-queue'
import { createScopedTerminalRetentionProcessorForTest } from '@voucha/test-helpers/terminal-retention-processor'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig } from '@services/data-retention/config'
import { enqueueTerminalActivityRetention } from '@queues/psql/enqueues/activitypub-terminal-retention'

const terminalJobId = (family: 'follow' | 'like') => `psql__terminal_activity_retention__${family}`

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
      const completed = harness.nextTerminal(terminalJobId('follow'))
      const jobs = await enqueueTerminalActivityRetention(['follow'])
      expect(jobs).toHaveLength(1)
      await expect(completed).resolves.toBe('completed')
      expect(runs).toBe(2)
      const stored = await harness.queue.getJob(terminalJobId('follow'))
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
      const first = harness.nextTerminal(terminalJobId('follow'))
      const like = harness.nextTerminal(terminalJobId('like'))
      const jobs = await enqueueTerminalActivityRetention(['follow', 'like'])
      expect(jobs.map(job => job.id).toSorted()).toEqual(
        ['follow', 'like'].map(family => terminalJobId(family)).toSorted(),
      )
      await entered.promise
      await expect(enqueueTerminalActivityRetention(['follow'])).resolves.toEqual([])
      await expect(like).resolves.toBe('completed')
      release.resolve()
      await expect(first).resolves.toBe('completed')
      const next = harness.nextTerminal(terminalJobId('follow'))
      expect(await enqueueTerminalActivityRetention(['follow'])).toHaveLength(1)
      await expect(next).resolves.toBe('completed')
      expect(followRuns).toBe(2)
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
      const followId = terminalJobId('follow')
      const completed = harness.nextTerminal(followId)
      await enqueueTerminalActivityRetention(['follow'])
      await expect(completed).resolves.toBe('completed')
      expect(fixture.pages).toEqual([
        { deleted: 1, hasMore: true },
        { deleted: 1, hasMore: true },
        { deleted: 0, hasMore: false },
      ])
      expect(runs).toBe(3)
      expect(attemptsAfterYield).toBe(0)
      expect(await (await harness.queue.getJob(followId))?.getState()).toBe('completed')
    } finally {
      await fixture.cleanup()
    }
  })
})
