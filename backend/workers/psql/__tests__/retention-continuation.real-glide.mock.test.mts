import { DelayedError } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createAIRetentionContinuationFixture } from '@voucha/test-helpers/ai-retention-continuation-fixtures'
import { createCommittedRetentionCacheFixture } from '@voucha/test-helpers/ai-retention-committed-cache'
import { enqueueAIRetentionContinuations } from '@queues/psql/enqueues'
import { psql } from '@queues/psql/queues'
import {
  AI_RETENTION_FAMILIES,
  type AIRetentionContinuationData,
  type AIRetentionFamily,
} from '@queues/psql/types'
import { cleanupAIRetentionFamily } from '@services/data-retention'
import { createAIRetentionContinuationProcessor } from '../processors/retention-continuation.mts'
import processPsql from '../processors.mts'

// This transport project exercises real GlideMQ admission. Processors run on the fetched job.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

function continuationJobId(family: AIRetentionFamily): string {
  return `ai_retention_continuation__${family}`
}

async function requireContinuationJob(family: AIRetentionFamily) {
  const job = await psql.getJob(continuationJobId(family))
  if (!job) throw new Error(`missing AI retention continuation for ${family}`)
  return job
}

function removeContinuationOnFinish(family: AIRetentionFamily): void {
  onTestFinished(async () => {
    const job = await psql.getJob(continuationJobId(family))
    if (job) await job.remove()
  })
}

function continuationProcessorJob(
  job: Awaited<ReturnType<typeof requireContinuationJob>>,
): Parameters<ReturnType<typeof createAIRetentionContinuationProcessor>>[0] {
  const data: unknown = job.data
  if (typeof data !== 'object' || data === null || !('family' in data)) {
    throw new Error('missing AI retention continuation family')
  }
  const family = AI_RETENTION_FAMILIES.find(candidate => candidate === data.family)
  if (!family) throw new Error('missing AI retention continuation family')
  // moveToDelayed yields only after a worker has marked the job active.
  job.entryId = '0-0'
  const payload: AIRetentionContinuationData = { family }
  return {
    data: payload,
    updateData: next => job.updateData(next),
    moveToDelayed: timestamp => job.moveToDelayed(timestamp),
  }
}

async function runFetchedContinuation(
  family: AIRetentionFamily,
  process: ReturnType<typeof createAIRetentionContinuationProcessor>,
): Promise<void> {
  try {
    await process(continuationProcessorJob(await requireContinuationJob(family)))
  } catch (err) {
    if (err instanceof DelayedError) return
    throw err
  }
}

async function removeContinuation(family: AIRetentionFamily): Promise<void> {
  const job = await psql.getJob(continuationJobId(family))
  if (job) await job.remove()
}

describe('AI retention continuation delivery', () => {
  it.each(AI_RETENTION_FAMILIES)(
    '%s drains bounded pages on the fetched continuation and admits again after that record is removed',
    async family => {
      removeContinuationOnFinish(family)
      await removeContinuation(family)
      await using query = await beginTransaction()
      const fixture = await createAIRetentionContinuationFixture(family, query)
      const process = createAIRetentionContinuationProcessor((selected, limits) =>
        cleanupAIRetentionFamily(selected, { ...limits, ...fixture.options }),
      )
      const first = await enqueueAIRetentionContinuations([family])
      expect(first.map(job => job.id)).toEqual([continuationJobId(family)])
      const job = await requireContinuationJob(family)
      expect(job.data).toEqual({ family })
      expect(job.opts).toMatchObject({
        priority: 10,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
        ordering: { key: `psql:ai-retention:${family}`, concurrency: 1 },
      })
      await expect(enqueueAIRetentionContinuations([family, family])).resolves.toEqual([])
      for (let pass = 0; pass < fixture.passes; pass += 1) {
        await runFetchedContinuation(family, process)
      }
      expect(await fixture.state()).toEqual(fixture.expected)
      expect((await requireContinuationJob(family)).attemptsMade).toBe(0)

      await (await requireContinuationJob(family)).remove()
      expect(await enqueueAIRetentionContinuations([family])).toHaveLength(1)
    },
  )

  it('the daily seed admits actual backlogged families and skips the family already drained', async () => {
    for (const family of AI_RETENTION_FAMILIES) removeContinuationOnFinish(family)
    for (const family of AI_RETENTION_FAMILIES) await removeContinuation(family)
    await using query = await beginTransaction()
    const fixtures = new Map(
      await Promise.all(
        AI_RETENTION_FAMILIES.map(
          async family =>
            [family, await createAIRetentionContinuationFixture(family, query)] as const,
        ),
      ),
    )
    const drained = fixtures.get('textEmbeddingCache')
    if (!drained) throw new Error('missing text embedding retention fixture')
    await cleanupAIRetentionFamily('textEmbeddingCache', { ...drained.options, maxBatches: 3 })
    const familyResults = Object.fromEntries(
      await Promise.all(
        AI_RETENTION_FAMILIES.map(async family => {
          const fixture = fixtures.get(family)
          if (!fixture) throw new Error(`missing AI retention fixture for ${family}`)
          return [family, await cleanupAIRetentionFamily(family, fixture.options)] as const
        }),
      ),
    ) as Record<(typeof AI_RETENTION_FAMILIES)[number], { deleted: number; hasMore: boolean }>
    const dailyResults = {
      ...familyResults,
      classifierRecords: {},
      softDeletedUsers: { deleted: 0, hasMore: false },
      agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
      aiUsageRecords: { hasMore: false },
      supersededVoteBallots: [],
      orphanedUserAgentStrings: { hasMore: false },
      voteIntegrityDetails: { hasMore: false },
      postModerationLedger: {
        deletedVersions: 0,
        clearedPassEvidence: 0,
        hasMore: false,
        remainingKinds: [],
      },
    }
    const backlogged = AI_RETENTION_FAMILIES.filter(family => family !== 'textEmbeddingCache')
    expect(AI_RETENTION_FAMILIES.filter(family => dailyResults[family].hasMore)).toEqual(backlogged)
    const process = createAIRetentionContinuationProcessor((family, limits) => {
      const fixture = fixtures.get(family)
      if (!fixture) throw new Error(`missing AI retention fixture for ${family}`)
      return cleanupAIRetentionFamily(family, { ...limits, ...fixture.options })
    })
    const admitted: string[] = []
    const result = await processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup: async () => dailyResults as never,
      enqueueAIRetentionContinuations: async families => {
        const jobs = await enqueueAIRetentionContinuations(families)
        admitted.push(...jobs.map(job => job.id))
        return jobs
      },
    })
    expect(result).toBe(dailyResults)
    expect(admitted).toEqual(backlogged.map(continuationJobId))
    expect(await psql.getJob(continuationJobId('textEmbeddingCache'))).toBeNull()
    for (const family of backlogged) {
      const fixture = fixtures.get(family)
      if (!fixture) throw new Error(`missing AI retention fixture for ${family}`)
      for (let pass = 0; pass < fixture.passes; pass += 1) {
        await runFetchedContinuation(family, process)
      }
      expect(await fixture.state()).toEqual(fixture.expected)
    }
    const drainedState = await drained.state()
    expect(drainedState).toEqual(drained.expected)
  })

  it('propagates a processor failure without advancing the fetched job, then drains that same job', async () => {
    const family = 'textEmbeddingCache' satisfies AIRetentionFamily
    removeContinuationOnFinish(family)
    await removeContinuation(family)
    await using query = await beginTransaction()
    const fixture = await createAIRetentionContinuationFixture(family, query)
    let failNext = true
    const process = createAIRetentionContinuationProcessor((selected, limits) => {
      if (failNext) {
        failNext = false
        throw new Error('Owned retention attempt failure')
      }
      return cleanupAIRetentionFamily(selected, { ...limits, ...fixture.options })
    })
    await enqueueAIRetentionContinuations([family])
    const job = await requireContinuationJob(family)
    expect(job.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
    })
    await expect(process(continuationProcessorJob(job))).rejects.toThrow(
      'Owned retention attempt failure',
    )
    expect((await requireContinuationJob(family)).attemptsMade).toBe(0)
    for (let pass = 0; pass < fixture.passes; pass += 1) {
      await runFetchedContinuation(family, process)
    }
    expect(await fixture.state()).toEqual(fixture.expected)
  })

  it('commits each pass before the next call and cleans only its owned cache hashes', async () => {
    const family = 'textEmbeddingCache' satisfies AIRetentionFamily
    removeContinuationOnFinish(family)
    await removeContinuation(family)
    const fixture = await createCommittedRetentionCacheFixture()
    onTestFinished(fixture.cleanup)
    const process = createAIRetentionContinuationProcessor((selected, limits) =>
      cleanupAIRetentionFamily(selected, { ...limits, ...fixture.options }),
    )
    await enqueueAIRetentionContinuations([family])
    await runFetchedContinuation(family, process)
    const afterFirst = await fixture.state()
    expect(afterFirst.slice(0, 2).filter(Boolean)).toHaveLength(1)
    expect(afterFirst[2]).toBe(true)
    await runFetchedContinuation(family, process)
    expect(await fixture.state()).toEqual([false, false, true])
  })
})
