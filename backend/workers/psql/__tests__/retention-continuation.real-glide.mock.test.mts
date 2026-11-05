import { DelayedError } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import {
  createAIRetentionContinuationFixture,
  reserveAIRetentionContinuationJobs,
} from '@voucha/test-helpers/ai-retention-continuation-fixtures'
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
  it('rejects an unknown family without advancing the fetched job', async () => {
    const reservation = await reserveAIRetentionContinuationJobs()
    onTestFinished(() => reservation.release())
    const family = 'textEmbeddingCache' satisfies AIRetentionFamily
    removeContinuationOnFinish(family)
    await removeContinuation(family)
    await enqueueAIRetentionContinuations([family])
    const job = await requireContinuationJob(family)
    const invalidJob = continuationProcessorJob(job)
    invalidJob.data.family = 'unknownFamily' as AIRetentionFamily

    await expect(createAIRetentionContinuationProcessor()(invalidJob)).rejects.toThrow(
      'Unknown AI retention family: unknownFamily',
    )
    expect((await requireContinuationJob(family)).attemptsMade).toBe(0)
  })

  it.each(AI_RETENTION_FAMILIES)(
    '%s drains bounded pages on the fetched continuation and admits again after that record is removed',
    async family => {
      const reservation = await reserveAIRetentionContinuationJobs()
      onTestFinished(() => reservation.release())
      removeContinuationOnFinish(family)
      await removeContinuation(family)
      await using query = await beginTransaction()
      const fixture = await createAIRetentionContinuationFixture(family, query)
      const process = createAIRetentionContinuationProcessor({ [family]: fixture.options })
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
    const reservation = await reserveAIRetentionContinuationJobs()
    onTestFinished(() => reservation.release())
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
    const terminalBatches = fixtures.get('terminalEmbeddingBatches')
    const mediaChanges = fixtures.get('oldMediaDeliveryChanges')
    if (!terminalBatches || !mediaChanges) throw new Error('missing AI retention fixture')
    await cleanupAIRetentionFamily('textEmbeddingCache', { ...drained.options, maxBatches: 3 })
    expect(await drained.state()).toEqual(drained.expected)
    expect(await drained.excludedState()).toBe(true)
    expect(await terminalBatches.excludedState()).toBe(true)
    expect(await mediaChanges.excludedState()).toEqual([true, true, true, true])
    const process = createAIRetentionContinuationProcessor({
      terminalEmbeddingBatches: terminalBatches.options,
      oldMediaDeliveryChanges: mediaChanges.options,
    })
    const result = await processPsql('dataRetentionCleanup', undefined, undefined, undefined, {
      retention: {
        families: ['textEmbeddingCache', 'terminalEmbeddingBatches', 'oldMediaDeliveryChanges'],
        textEmbeddingCache: drained.options,
        terminalEmbeddingBatches: { ...terminalBatches.options, lowerBoundDate: undefined },
        oldMediaDeliveryChanges: { ...mediaChanges.options, lowerBoundDate: undefined },
      },
    })
    expect(result).toMatchObject({ textEmbeddingCache: { deleted: 0, hasMore: false } })
    expect(await psql.getJob(continuationJobId('textEmbeddingCache'))).toBeNull()
    expect(await drained.excludedState()).toBe(true)
    expect(result).toMatchObject({
      terminalEmbeddingBatches: { deleted: 1, hasMore: true },
    })
    const terminalJob = await requireContinuationJob('terminalEmbeddingBatches')
    expect(terminalJob.id).toBe('ai_retention_continuation__terminalEmbeddingBatches')
    expect(await terminalBatches.excludedState()).toBe(true)

    expect(result).toMatchObject({ oldMediaDeliveryChanges: { deleted: 1, hasMore: true } })
    const mediaJob = await requireContinuationJob('oldMediaDeliveryChanges')
    expect(mediaJob.id).toBe('ai_retention_continuation__oldMediaDeliveryChanges')
    expect(await mediaChanges.excludedState()).toEqual([true, true, true, true])
    for (const family of ['terminalEmbeddingBatches', 'oldMediaDeliveryChanges'] as const) {
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
    const reservation = await reserveAIRetentionContinuationJobs()
    onTestFinished(() => reservation.release())
    const family = 'textEmbeddingCache' satisfies AIRetentionFamily
    removeContinuationOnFinish(family)
    await removeContinuation(family)
    await using query = await beginTransaction()
    const fixture = await createAIRetentionContinuationFixture(family, query)
    const failingProcess = createAIRetentionContinuationProcessor({
      [family]: { ...fixture.options, now: new Date(Number.NaN) },
    })
    const process = createAIRetentionContinuationProcessor({ [family]: fixture.options })
    await enqueueAIRetentionContinuations([family])
    const job = await requireContinuationJob(family)
    expect(job.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
    })
    expect(await fixture.state()).toEqual([true, true, true])
    expect(await fixture.excludedState()).toBe(true)
    await expect(failingProcess(continuationProcessorJob(job))).rejects.toBeDefined()
    expect(await fixture.state()).toEqual([true, true, true])
    expect(await fixture.excludedState()).toBe(true)
    expect((await requireContinuationJob(family)).attemptsMade).toBe(0)
    for (let pass = 0; pass < fixture.passes; pass += 1) {
      await runFetchedContinuation(family, process)
    }
    expect(await fixture.state()).toEqual(fixture.expected)
    expect(await fixture.excludedState()).toBe(true)
  })

  it('commits each pass before the next call and cleans only its owned cache hashes', async () => {
    const reservation = await reserveAIRetentionContinuationJobs()
    onTestFinished(() => reservation.release())
    const family = 'textEmbeddingCache' satisfies AIRetentionFamily
    removeContinuationOnFinish(family)
    await removeContinuation(family)
    const fixture = await createCommittedRetentionCacheFixture()
    onTestFinished(fixture.cleanup)
    const process = createAIRetentionContinuationProcessor({ [family]: fixture.options })
    await enqueueAIRetentionContinuations([family])
    await runFetchedContinuation(family, process)
    const afterFirst = await fixture.state()
    expect(afterFirst.slice(0, 2).filter(Boolean)).toHaveLength(1)
    expect(afterFirst[2]).toBe(true)
    await runFetchedContinuation(family, process)
    expect(await fixture.state()).toEqual([false, false, true])
  })
})
