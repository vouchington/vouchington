import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  TOPIC_MERGE_PAGE_JOB,
  type TopicMergePageData,
} from '@queues/background/enqueues/topic-merge-jobs'
import { topicMergePageJobId } from '@queues/background/enqueues/topic-merge-enqueues'
import { processTopicMergeOperationPage } from '@services/topics/merge-operation-page'
import { dispatchStalledTopicMergePage } from '@services/topics/merge-recovery'
import { topicMergeWorkConfig } from '@services/topics/merge-work-limits'
import { createTopicAliases } from '@services/topics/aliases'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTopicMergeNativeOperation,
  deleteTopicMergeNativeOperation,
  getTopicMergeNativeCheckpoint,
} from '@voucha/test-helpers/topic-merge-native-operation'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createBackgroundProcessor } from '../background/processors.mts'
import { createTopicMergePageHandler } from './processors/page-handler.mts'

// This project restores the external GlideMQ transport in place of the default in-memory adapter.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
type Terminal = 'completed' | 'failed'

describe('topic merge operation pages through native GlideMQ', () => {
  let harness: BackgroundHarness | undefined
  const ownedOperations: string[] = []

  afterEach(async () => {
    await harness?.close()
    harness = undefined
    for (const operationId of ownedOperations.splice(0)) {
      await deleteTopicMergeNativeOperation(operationId)
    }
  })

  async function createOperation(sourceAliases: string[] = []) {
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    if (sourceAliases.length)
      await createTopicAliases(source.id, sourceAliases, { skipSideEffects: true })
    const operationId = await createTopicMergeNativeOperation(
      source.id,
      destination.id,
      administrator.id,
    )
    ownedOperations.push(operationId)
    return { operationId, source, destination }
  }

  function pageId(operationId: string, generation: number): string {
    return topicMergePageJobId({ operationId, generation })
  }

  it('chains one-row native pages, then completes the same durable operation through PostgreSQL pages', async () => {
    const token = randomUUID()
    const sourceAliases = [`native-merge-a-${token}`, `native-merge-b-${token}`]
    const { operationId, source } = await createOperation(sourceAliases)

    // Reach a real alias-row boundary with the same production page service. The preflight and
    // capture inventories visit many empty tables, so their queue latency is not this proof's aim.
    const restorePreludeSize = overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, {
      page_size: 64,
    })
    onTestFinished(restorePreludeSize)
    let prelude = await getTopicMergeNativeCheckpoint(operationId)
    for (let page = 0; page < 2_000; page += 1) {
      if (prelude.stage === 'aliases' && prelude.alias_phase === 1) break
      const next = await processTopicMergeOperationPage(operationId, prelude.generation)
      if (next === null) throw new Error(`Merge ended before alias rows at ${prelude.stage}`)
      prelude = await getTopicMergeNativeCheckpoint(operationId)
    }
    expect(prelude).toMatchObject({ stage: 'aliases', alias_phase: 1, cursor_alias: null })

    restorePreludeSize()
    const restoreOneRowPages = overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, {
      page_size: 1,
    })
    onTestFinished(restoreOneRowPages)
    const nativeStopGeneration = prelude.generation + 3
    const receipts = new Map<number, Promise<Terminal>>()
    const enqueuePage = async (id: string, generation: number) => {
      // The three native generations each snapshot one real source alias or its reserved slug.
      if (generation === nativeStopGeneration) return
      const jobId = pageId(id, generation)
      receipts.set(generation, harness!.settled({ id: jobId }))
      await harness!.add(TOPIC_MERGE_PAGE_JOB, { operationId: id, generation }, { jobId })
    }
    const handler = createTopicMergePageHandler(enqueuePage)
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: { [TOPIC_MERGE_PAGE_JOB.name]: job => handler.handle(job) },
    })

    await enqueuePage(operationId, prelude.generation)
    const successorsAdmitted: boolean[] = []
    for (let generation = prelude.generation; generation < nativeStopGeneration; generation += 1) {
      const settled = receipts.get(generation)
      if (!settled) throw new Error(`Missing page ${generation} receipt`)
      expect(await settled).toBe('completed')
      const checkpoint = await getTopicMergeNativeCheckpoint(operationId)
      expect(checkpoint.generation).toBeGreaterThan(generation)
      expect(checkpoint.failed_at).toBeNull()
      if (generation < nativeStopGeneration - 1)
        successorsAdmitted.push(receipts.has(generation + 1))
    }
    expect(successorsAdmitted).toEqual([true, true])
    const nativeCheckpoint = await getTopicMergeNativeCheckpoint(operationId)
    expect(nativeCheckpoint.generation).toBe(nativeStopGeneration)
    expect(nativeCheckpoint.stage).toBe('aliases')
    expect(nativeCheckpoint.alias_phase).toBe(1)
    expect(nativeCheckpoint.cursor_alias).toBe([source.slug, ...sourceAliases].toSorted().at(-1))
    expect(nativeCheckpoint.completed_at).toBeNull()
    expect(receipts.size).toBe(3)
    expect(await harness.queue.getJob(pageId(operationId, nativeStopGeneration))).toBeNull()

    // The remaining stages keep the one-row limit and the same durable generations, while their
    // table-by-table SQL pages avoid hundreds of native transport round trips.
    let next: number | null = nativeCheckpoint.generation
    for (let page = 0; page < 2_000 && next !== null; page += 1) {
      next = await processTopicMergeOperationPage(operationId, next)
    }
    if (next !== null) {
      const stopped = await getTopicMergeNativeCheckpoint(operationId)
      throw new Error(
        `Topic merge exceeded 2,000 committed pages at generation ${stopped.generation}, ` +
          `stage ${stopped.stage}, alias phase ${stopped.alias_phase}, ` +
          `cursor ${stopped.cursor_alias ?? '<none>'}`,
      )
    }
    const completed = await getTopicMergeNativeCheckpoint(operationId)
    expect(completed.generation).toBeGreaterThan(nativeCheckpoint.generation)
    expect(completed.completed_at).not.toBeNull()
    expect(completed.failed_at).toBeNull()
    expect(harness.stalledJobIds).toEqual([])
  })

  it('settles a stale duplicate generation without advancing the durable checkpoint', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))
    const { operationId } = await createOperation()
    await expect(processTopicMergeOperationPage(operationId, 0)).resolves.toBe(1)
    const before = await getTopicMergeNativeCheckpoint(operationId)
    const handler = createTopicMergePageHandler(async () => {
      throw new Error('Stale page must not enqueue a successor')
    })
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: { [TOPIC_MERGE_PAGE_JOB.name]: job => handler.handle(job) },
    })
    const jobId = pageId(operationId, 0)
    const settled = harness.settled({ id: jobId })
    await harness.add(TOPIC_MERGE_PAGE_JOB, { operationId, generation: 0 }, { jobId })
    await expect(settled).resolves.toBe('completed')
    const after = await getTopicMergeNativeCheckpoint(operationId)
    expect(after).toEqual(before)
  })

  it('admits the missing successor from a committed page checkpoint', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))
    const { operationId } = await createOperation()
    await expect(processTopicMergeOperationPage(operationId, 0)).resolves.toBe(1)
    const before = await getTopicMergeNativeCheckpoint(operationId)
    const successorId = pageId(operationId, 1)
    const handler = createTopicMergePageHandler(async (id, generation) => {
      await harness!.add(
        TOPIC_MERGE_PAGE_JOB,
        { operationId: id, generation },
        { jobId: pageId(id, generation), delay: 60_000 },
      )
    })
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: { [TOPIC_MERGE_PAGE_JOB.name]: job => handler.handle(job) },
    })
    expect(await harness.queue.getJob(successorId)).toBeNull()
    const settled = harness.settled({ id: successorId })
    const result = await dispatchStalledTopicMergePage(
      {
        highWaterId: operationId,
        cursorOperationId: uuidBefore(operationId),
        staleBefore: new Date(before.updated_at.getTime() + 1_000).toISOString(),
      },
      1,
      async inputs => {
        await harness!.queue.addBulk(
          inputs.map(data => ({
            name: TOPIC_MERGE_PAGE_JOB.name,
            data,
            opts: { ...TOPIC_MERGE_PAGE_JOB.options, jobId: topicMergePageJobId(data) },
          })),
        )
      },
    )
    expect(result.result).toBe(1)
    await expect(settled).resolves.toBe('completed')
    expect((await getTopicMergeNativeCheckpoint(operationId)).generation).toBe(2)
  })

  it('recovers a committed page gap even when its native job id is retained as failed', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))
    const { operationId } = await createOperation()
    // The page commits, then its process ends before the successor is admitted.
    await expect(processTopicMergeOperationPage(operationId, 0)).resolves.toBe(1)
    const before = await getTopicMergeNativeCheckpoint(operationId)
    const recoveredId = pageId(operationId, 1)
    let failBeforePage = true
    const handler = createTopicMergePageHandler(async (id, generation) => {
      await harness!.add(
        TOPIC_MERGE_PAGE_JOB,
        { operationId: id, generation },
        { jobId: pageId(id, generation), delay: 60_000 },
      )
    })
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [TOPIC_MERGE_PAGE_JOB.name]: job => {
          if (failBeforePage) throw new Error('Injected terminal failure before the durable page')
          return handler.handle(job)
        },
      },
    })
    const firstSettlement = harness.settled({ id: recoveredId })
    await harness.add(
      TOPIC_MERGE_PAGE_JOB,
      { operationId, generation: 1 },
      { jobId: recoveredId, attempts: 1, removeOnFail: false },
    )
    await expect(firstSettlement).resolves.toBe('failed')
    await expect((await harness.queue.getJob(recoveredId))?.getState()).resolves.toBe('failed')
    expect(await getTopicMergeNativeCheckpoint(operationId)).toEqual(before)

    failBeforePage = false
    const reactivated = harness.activated({ id: recoveredId }, 2)
    const enqueueRecovered = (inputs: TopicMergePageData[]) =>
      enqueueBulkReactivatingFinished({
        queue: harness!.queue,
        inputs,
        jobIdOf: topicMergePageJobId,
        enqueueBulk: pages =>
          harness!.queue.addBulk(
            pages.map(data => ({
              name: TOPIC_MERGE_PAGE_JOB.name,
              data,
              opts: { ...TOPIC_MERGE_PAGE_JOB.options, jobId: topicMergePageJobId(data) },
            })),
          ),
      })
    const result = await dispatchStalledTopicMergePage(
      {
        highWaterId: operationId,
        cursorOperationId: uuidBefore(operationId),
        // A future sweep cutoff represents the stale instant without a timer or shared-clock change.
        staleBefore: new Date(before.updated_at.getTime() + 1_000).toISOString(),
      },
      1,
      enqueueRecovered,
    )
    expect(result.result).toBe(1)
    await reactivated
    // Closing joins the activated processor; its delayed successor remains scoped to this queue.
    await harness.close()
    expect((await getTopicMergeNativeCheckpoint(operationId)).generation).toBe(2)
    expect(harness.stalledJobIds).toEqual([])
  })
})
