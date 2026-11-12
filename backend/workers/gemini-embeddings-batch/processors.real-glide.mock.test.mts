import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Queue, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  getSingleEmbeddingBacklogSnapshot,
  isSingleEmbeddingBackedUp,
} from '@queues/gemini-embeddings/enqueues/single-backlog'
import { streamPendingPosts } from '@services/embeddings-batch/entities/posts'
import { createTestUserDirect, deleteTestPost, insertTestPost } from '@voucha/test-helpers'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { getMinUUIDv7ForDate } from '../../modules/utils/ids.mts'
import { uuidAfter } from '@voucha/test-helpers/uuid-before'
import { backgroundCpu } from '../../queues/background-cpu/queues.mts'
import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processBatchPollingDispatcher, processStaleCleanupDispatcher } from './processors.mts'
import { processEmbeddingsBatchJob } from './processors/worker-router.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('bounded shared Gemini single backlog through real GlideMQ', () => {
  let queue: Queue | undefined

  afterEach(async () => {
    if (!queue) return
    await queue.obliterate({ force: true })
    await queue.close()
    queue = undefined
  })

  it('filters unrelated CPU work and admits when a saturated scan sees too few singles', async () => {
    queue = new Queue(`single_backlog_${randomUUID()}`, connection)
    await Promise.all([
      queue.add('crawl.crawl_url', { id: randomUUID() }, { priority: 10 }),
      queue.add('content-analysis.post', { id: randomUUID() }, { priority: 10 }),
      queue.add('gemini-embeddings.post', { id: randomUUID() }, { priority: 10 }),
    ])
    const exact = await getSingleEmbeddingBacklogSnapshot(queue, 10, 0)
    expect(exact).toEqual({ depth: 1, uncertain: false })
    expect(await isSingleEmbeddingBackedUp(queue, 10, 2, 0)).toBe(false)
    expect(await isSingleEmbeddingBackedUp(queue, 10, 1, 0)).toBe(true)

    const saturated = await getSingleEmbeddingBacklogSnapshot(queue, 2, 2_000)
    expect(saturated.uncertain).toBe(true)
    expect(await isSingleEmbeddingBackedUp(queue, 2, 2, 2_000)).toBe(false)

    await queue.obliterate({ force: true })
    const drained = await getSingleEmbeddingBacklogSnapshot(queue, 2, 4_000)
    expect(drained).toEqual({ depth: 0, uncertain: false })
    expect(await isSingleEmbeddingBackedUp(queue, 2, 2, 4_000)).toBe(false)
  })

  it('evicts a failed native queue scan before the next call at the same clock', async () => {
    queue = new Queue(`single_backlog_closed_${randomUUID()}`, connection)
    const closedQueue = queue
    await closedQueue.close()
    queue = undefined
    const getJobs = vi.spyOn(closedQueue, 'getJobs')
    try {
      await expect(getSingleEmbeddingBacklogSnapshot(closedQueue, 2, 0)).rejects.toBeInstanceOf(
        Error,
      )
      expect(getJobs).toHaveBeenCalledTimes(3)
      await expect(getSingleEmbeddingBacklogSnapshot(closedQueue, 2, 0)).rejects.toBeInstanceOf(
        Error,
      )
      expect(getJobs).toHaveBeenCalledTimes(6)
      expect(getJobs.mock.calls.filter(([state]) => state === 'waiting')).toHaveLength(2)
      expect(getJobs.mock.calls.filter(([state]) => state === 'active')).toHaveLength(2)
      expect(getJobs.mock.calls.filter(([state]) => state === 'delayed')).toHaveLength(2)
    } finally {
      getJobs.mockRestore()
    }
  })

  it('keeps a missing post eligible for the scheduled creation path under unrelated saturation', async () => {
    queue = new Queue(`single_recovery_${randomUUID()}`, connection)
    await Promise.all(
      Array.from({ length: 2 }, () =>
        queue!.add('crawl.crawl_url', { id: randomUUID() }, { priority: 10 }),
      ),
    )
    const snapshot = await getSingleEmbeddingBacklogSnapshot(queue, 2, 0)
    expect(snapshot.uncertain).toBe(true)
    expect(await isSingleEmbeddingBackedUp(queue, 2, 1, 0)).toBe(false)

    const user = await createTestUserDirect()
    const createdAt = new Date(Date.now() + 3_600_000)
    const postId = await insertTestPost({
      createdAt,
      title: 'Persisted missing embedding',
      slug: `cpu-recovery-${randomUUID()}`,
      markdown: 'This post remains available to the scheduled batch creation scan.',
      createdById: user.id,
    })
    onTestFinished(() => deleteTestPost(postId))
    const sweepStartedAt = new Date(createdAt.getTime() + 3_600_000).toISOString()
    const pending = streamPendingPosts({
      cursor: { sweepStartedAt, afterId: uuidAfter(postId) },
      limits: { batchSize: 1, maxRows: 1 },
    })
    const first = await pending.next()
    expect(first.value?.id).toBe(postId)
    await pending.return(undefined)
  })
})

describe('bounded Gemini batch dispatcher continuations', () => {
  it('polls a capped page and resumes the persisted cursor without crossing its upper bound', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.UTC(2400, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `gemini-embeddings__poll_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `gemini-embeddings__poll_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      for (const id of ids) {
        const jobs = await backgroundCpu.searchJobs({
          name: 'gemini-embeddings.poll_batch',
          data: { batch_id: id },
        })
        await Promise.all(jobs.map(job => job.remove()))
      }
      await (await backgroundCpu.getJob(continuationId))?.remove()
      await (await backgroundCpu.getJob(terminalContinuationId))?.remove()
      await cleanupTestEmbeddingsBatches(ids)
    })
    await Promise.all(ids.map(id => insertTestEmbeddingsBatch({ id })))

    await expect(processBatchPollingDispatcher(cursor)).resolves.toEqual({
      count: 1,
      hasMore: true,
    })
    const continuation = await backgroundCpu.getJob(continuationId)
    expect(continuation?.data).toEqual({ cursor: { afterId: ids[0], throughId: cursor.throughId } })
    expect(
      await backgroundCpu.searchJobs({
        name: 'gemini-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'gemini-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(0)
    if (!continuation) throw new Error('Expected persisted polling continuation')

    await expect(
      processEmbeddingsBatchJob(continuation as Job<Record<string, unknown>>),
    ).resolves.toEqual({
      count: 1,
      hasMore: false,
    })
    expect(
      await backgroundCpu.searchJobs({
        name: 'gemini-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'gemini-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'gemini-embeddings.poll_batch',
        data: { batch_id: ids[2] },
      }),
    ).toHaveLength(0)
    expect(await backgroundCpu.getJob(terminalContinuationId)).toBeNull()
  })

  it('continues stale cleanup past provider-completed batches awaiting ingestion', async () => {
    const fixture = createVertexHttpFixture()
    const requests: string[] = []
    const runCleanup = (...args: Parameters<typeof processStaleCleanupDispatcher>) =>
      fixture.run(() => processStaleCleanupDispatcher(...args))
    const runJob = (...args: Parameters<typeof processEmbeddingsBatchJob>) =>
      fixture.run(() => processEmbeddingsBatchJob(...args))
    onTestFinished(
      overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
        stale_ttl_hours: 96,
      }),
    )
    const timestamp = Date.UTC(2401, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `gemini-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `gemini-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      await (await backgroundCpu.getJob(continuationId))?.remove()
      await (await backgroundCpu.getJob(terminalContinuationId))?.remove()
      await cleanupTestEmbeddingsBatches(ids)
    })
    const jobNames = ids.map(id => `projects/123456/locations/us/batchPredictionJobs/${id}`)
    await Promise.all(
      ids.map((id, index) =>
        insertTestEmbeddingsBatch({
          id,
          jobName: jobNames[index],
          submittedAt: new Date(Date.now() - 97 * 60 * 60 * 1000),
        }),
      ),
    )
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: /^\/v1\/projects\/123456\/locations\/us\/batchPredictionJobs\/[^/?]+$/,
      })
      .reply(200, options => {
        const name = options.path.slice(4)
        requests.push(name)
        return { name, state: 'JOB_STATE_SUCCEEDED' }
      })
      .persist()

    await expect(runCleanup(cursor)).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: true,
    })
    const continuation = await backgroundCpu.getJob(continuationId)
    expect(continuation?.data).toEqual({ cursor: { afterId: ids[0], throughId: cursor.throughId } })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toBe(jobNames[0])
    if (!continuation) throw new Error('Expected persisted stale-cleanup continuation')

    await expect(runJob(continuation as Job<Record<string, unknown>>)).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: true,
    })
    expect(requests).toHaveLength(2)
    expect(requests[1]).toBe(jobNames[1])
    const terminal = await backgroundCpu.getJob(terminalContinuationId)
    expect(terminal).not.toBeNull()
    if (!terminal) throw new Error('Expected terminal stale-cleanup continuation')
    await expect(runJob(terminal as Job<Record<string, unknown>>)).resolves.toMatchObject({
      inspected: 0,
      hasMore: false,
    })
    await expect(getTestBatchSummary(ids[0]!)).resolves.toMatchObject({ status: 'submitted' })
    await expect(getTestBatchSummary(ids[1]!)).resolves.toMatchObject({ status: 'submitted' })
  })
})
