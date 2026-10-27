import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { beginTransaction } from '@voucha/test-helpers'
import { openAIRetentionContinuationHarness } from '@voucha/test-helpers/ai-retention-continuation'
import { createAIRetentionContinuationFixture } from '@voucha/test-helpers/ai-retention-continuation-fixtures'
import { AI_RETENTION_FAMILIES } from '@queues/psql/types'
import { aiRetentionContinuationId } from '@queues/psql/enqueues/ai-retention'
import { cleanupAIRetentionFamily } from '@services/data-retention'
import { createCommittedRetentionCacheFixture } from '@voucha/test-helpers/ai-retention-committed-cache'
import { createAIRetentionContinuationProcessor } from '../processors/retention-continuation.mts'
import processPsql from '../processors.mts'

// This transport project exercises real GlideMQ, including native yielding and hard IDs.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('AI retention continuation delivery', () => {
  it.each(AI_RETENTION_FAMILIES)(
    '%s drains bounded owned pages through one live identity and reactivates a finished sweep',
    async family => {
      await using query = await beginTransaction()
      const fixture = await createAIRetentionContinuationFixture(family, query)
      const process = createAIRetentionContinuationProcessor((selected, limits) =>
        cleanupAIRetentionFamily(selected, { ...limits, ...fixture.options }),
      )
      const active = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const ids: string[] = []
      const harness = await openAIRetentionContinuationHarness(connection, async job => {
        ids.push(job.id)
        if (ids.length === 1) {
          active.resolve()
          await release.promise
        }
        return process(job)
      })
      onTestFinished(async () => {
        release.resolve()
        try {
          await harness.close()
        } finally {
          await query[Symbol.asyncDispose]()
        }
      })
      try {
        const completed = harness.completed(family)
        const first = await harness.enqueue([family])
        await active.promise
        expect(first.map(job => job.id)).toEqual([aiRetentionContinuationId(family)])
        expect(await harness.enqueue([family, family])).toEqual([])
        release.resolve()
        await completed
        expect(ids).toHaveLength(fixture.passes)
        expect(new Set(ids)).toEqual(new Set([aiRetentionContinuationId(family)]))
        expect(await fixture.state()).toEqual(fixture.expected)
        const finished = await harness.queue.getJob(aiRetentionContinuationId(family))
        expect(finished?.attemptsMade).toBe(0)
        expect(finished?.opts.ordering).toEqual({
          key: `psql:ai-retention:${family}`,
          concurrency: 1,
        })

        const reactivated = harness.completed(family)
        expect(await harness.enqueue([family])).toHaveLength(1)
        await reactivated
        expect(await fixture.state()).toEqual(fixture.expected)
        expect(harness.failures).toEqual([])
        expect(harness.failedAttempts).toEqual([])
      } finally {
        release.resolve()
        await harness.close()
      }
    },
  )

  it('the daily seed admits actual backlogged families and skips the family already drained', async () => {
    await using query = await beginTransaction()
    const fixtures = new Map(
      await Promise.all(
        AI_RETENTION_FAMILIES.map(
          async family =>
            [family, await createAIRetentionContinuationFixture(family, query)] as const,
        ),
      ),
    )
    const drained = fixtures.get('textEmbeddingCache')!
    await cleanupAIRetentionFamily('textEmbeddingCache', { ...drained.options, maxBatches: 3 })
    const familyResults = Object.fromEntries(
      await Promise.all(
        AI_RETENTION_FAMILIES.map(
          async family =>
            [
              family,
              await cleanupAIRetentionFamily(family, fixtures.get(family)!.options),
            ] as const,
        ),
      ),
    ) as Record<(typeof AI_RETENTION_FAMILIES)[number], { deleted: number; hasMore: boolean }>
    const dailyResults = { ...familyResults, classifierRecords: {} }
    const backlogged = AI_RETENTION_FAMILIES.filter(family => family !== 'textEmbeddingCache')
    expect(AI_RETENTION_FAMILIES.filter(family => dailyResults[family].hasMore)).toEqual(backlogged)
    const process = createAIRetentionContinuationProcessor((family, limits) =>
      cleanupAIRetentionFamily(family, { ...limits, ...fixtures.get(family)!.options }),
    )
    const harness = await openAIRetentionContinuationHarness(connection, process)
    try {
      const completed = Promise.all(backlogged.map(family => harness.completed(family)))
      const admitted: string[] = []
      const result = await processPsql('dataRetentionCleanup', undefined, {
        dataRetentionCleanup: async () => dailyResults as never,
        enqueueAIRetentionContinuations: async families => {
          const jobs = await harness.enqueue(families)
          admitted.push(...jobs.map(job => job.id))
          return jobs
        },
      })
      expect(result).toBe(dailyResults)
      expect(admitted).toEqual(backlogged.map(aiRetentionContinuationId))
      await completed
      expect(await harness.queue.getJob(aiRetentionContinuationId('textEmbeddingCache'))).toBeNull()
      for (const fixture of fixtures.values())
        expect(await fixture.state()).toEqual(fixture.expected)
      expect(harness.failures).toEqual([])
    } finally {
      await harness.close()
    }
  })

  it('retries an ordinary failure under the configured native attempt policy before draining the same owned pages', async () => {
    await using query = await beginTransaction()
    const fixture = await createAIRetentionContinuationFixture('textEmbeddingCache', query)
    const attempts: number[] = []
    let failNext = true
    const process = createAIRetentionContinuationProcessor((family, limits) => {
      if (failNext) {
        failNext = false
        throw new Error('Owned retention attempt failure')
      }
      return cleanupAIRetentionFamily(family, { ...limits, ...fixture.options })
    })
    const harness = await openAIRetentionContinuationHarness(connection, async job => {
      attempts.push(job.attemptsMade)
      return process(job)
    })
    try {
      const completed = harness.completed('textEmbeddingCache')
      const [admitted] = await harness.enqueue(['textEmbeddingCache'])
      expect(admitted?.opts.attempts).toBe(3)
      expect(admitted?.opts.backoff).toEqual({ type: 'exponential', delay: 1_000, jitter: 0.5 })
      await completed
      expect(attempts).toEqual([0, 1, 1])
      expect(await fixture.state()).toEqual(fixture.expected)
      expect(harness.failedAttempts.map(error => error.message)).toEqual([
        'Owned retention attempt failure',
      ])
      expect(harness.failures).toEqual([])
      const finished = await harness.queue.getJob(aiRetentionContinuationId('textEmbeddingCache'))
      expect(finished?.attemptsMade).toBe(1)
      expect(await finished?.getState()).toBe('completed')
    } finally {
      await harness.close()
    }
  })

  it('commits each native pass before the next delivery and cleans only its owned cache hashes', async () => {
    const fixture = await createCommittedRetentionCacheFixture()
    const secondStarted = Promise.withResolvers<void>()
    const releaseSecond = Promise.withResolvers<void>()
    const process = createAIRetentionContinuationProcessor((family, limits) =>
      cleanupAIRetentionFamily(family, { ...limits, ...fixture.options }),
    )
    let passes = 0
    let harness: Awaited<ReturnType<typeof openAIRetentionContinuationHarness>> | undefined
    onTestFinished(async () => {
      releaseSecond.resolve()
      try {
        await harness?.close()
      } finally {
        await fixture.cleanup()
      }
    })
    harness = await openAIRetentionContinuationHarness(connection, async job => {
      passes += 1
      if (passes === 2) {
        secondStarted.resolve()
        await releaseSecond.promise
      }
      return process(job)
    })
    try {
      const completed = harness.completed('textEmbeddingCache')
      await harness.enqueue(['textEmbeddingCache'])
      await secondStarted.promise
      // This reader borrows a separate pool connection, so it sees only committed progress.
      const afterFirst = await fixture.state()
      expect(afterFirst.slice(0, 2).filter(Boolean)).toHaveLength(1)
      expect(afterFirst[2]).toBe(true)
      releaseSecond.resolve()
      await completed
      expect(passes).toBe(2)
      expect(await fixture.state()).toEqual([false, false, true])
    } finally {
      releaseSecond.resolve()
      await harness.close()
    }
  })
})
