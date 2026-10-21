import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Queue, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  readSingleEmbeddingBacklogSnapshot,
  shouldDeferSingleEmbedding,
} from '@queues/bedrock-embeddings/enqueues/single-backlog'
import { streamPendingPosts } from '@services/bedrock-embeddings-batch/entities/posts'
import { createTestUserDirect, deleteTestPost, insertTestPost } from '@voucha/test-helpers'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { getMinUUIDv7ForDate } from '../../modules/utils/ids.mts'
import { backgroundCpu } from '../../queues/background-cpu/queues.mts'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processBatchPollingDispatcher, processStaleCleanupDispatcher } from './processors.mts'
import { processBedrockEmbeddingsBatchJob } from './processors/worker-router.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('bounded shared Bedrock single backlog through real GlideMQ', () => {
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
      queue.add('bedrock-embeddings.post', { id: randomUUID() }, { priority: 10 }),
    ])
    const exact = await readSingleEmbeddingBacklogSnapshot(queue, 10)
    expect(exact).toEqual({ depth: 1, uncertain: false })
    expect(shouldDeferSingleEmbedding(exact, 2)).toBe(false)
    expect(shouldDeferSingleEmbedding(exact, 1)).toBe(true)

    const saturated = await readSingleEmbeddingBacklogSnapshot(queue, 2)
    expect(saturated.uncertain).toBe(true)
    expect(shouldDeferSingleEmbedding(saturated, 2)).toBe(false)

    await queue.obliterate({ force: true })
    const drained = await readSingleEmbeddingBacklogSnapshot(queue, 2)
    expect(drained).toEqual({ depth: 0, uncertain: false })
    expect(shouldDeferSingleEmbedding(drained, 2)).toBe(false)
  })

  it('keeps a missing post eligible for the scheduled creation path under unrelated saturation', async () => {
    queue = new Queue(`single_recovery_${randomUUID()}`, connection)
    await Promise.all(
      Array.from({ length: 2 }, () =>
        queue!.add('crawl.crawl_url', { id: randomUUID() }, { priority: 10 }),
      ),
    )
    const snapshot = await readSingleEmbeddingBacklogSnapshot(queue, 2)
    expect(snapshot.uncertain).toBe(true)
    expect(shouldDeferSingleEmbedding(snapshot, 1)).toBe(false)

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
      cursor: { sweepStartedAt },
      limits: { batchSize: 1, maxRows: 1 },
    })
    const first = await pending.next()
    expect(first.value?.id).toBe(postId)
    await pending.return(undefined)
  })
})

describe('bounded Bedrock batch dispatcher continuations', () => {
  it('polls a capped page and resumes the persisted cursor without crossing its upper bound', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.UTC(2400, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `bedrock-embeddings__poll_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `bedrock-embeddings__poll_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      for (const id of ids) {
        const jobs = await backgroundCpu.searchJobs({
          name: 'bedrock-embeddings.poll_batch',
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
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(0)
    if (!continuation) throw new Error('Expected persisted polling continuation')

    await expect(
      processBedrockEmbeddingsBatchJob(continuation as Job<Record<string, unknown>>),
    ).resolves.toEqual({
      count: 1,
      hasMore: false,
    })
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[2] },
      }),
    ).toHaveLength(0)
    expect(await backgroundCpu.getJob(terminalContinuationId)).toBeNull()
  })

  it('continues stale cleanup past provider-completed batches awaiting ingestion', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
        stale_ttl_hours: 1,
      }),
    )
    const timestamp = Date.UTC(2401, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `bedrock-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `bedrock-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      await (await backgroundCpu.getJob(continuationId))?.remove()
      await (await backgroundCpu.getJob(terminalContinuationId))?.remove()
      await cleanupTestEmbeddingsBatches(ids)
      vi.mocked(BedrockControlClient.send).mockReset()
    })
    const jobArns = ids.map(
      id => `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
    )
    await Promise.all(
      ids.map((id, index) =>
        insertTestEmbeddingsBatch({
          id,
          jobArn: jobArns[index],
          submittedAt: new Date(Date.now() - 7_200_000),
        }),
      ),
    )
    vi.mocked(BedrockControlClient.send)
      .mockReset()
      .mockResolvedValue({ status: 'Completed' } as never)

    await expect(processStaleCleanupDispatcher(cursor)).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: true,
    })
    const continuation = await backgroundCpu.getJob(continuationId)
    expect(continuation?.data).toEqual({ cursor: { afterId: ids[0], throughId: cursor.throughId } })
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
    expect(BedrockControlClient.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ input: { jobIdentifier: jobArns[0] } }),
    )
    if (!continuation) throw new Error('Expected persisted stale-cleanup continuation')

    await expect(
      processBedrockEmbeddingsBatchJob(continuation as Job<Record<string, unknown>>),
    ).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: false,
    })
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
    expect(BedrockControlClient.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ input: { jobIdentifier: jobArns[1] } }),
    )
    expect(await backgroundCpu.getJob(terminalContinuationId)).toBeNull()
    await expect(getTestBatchSummary(ids[0]!)).resolves.toMatchObject({ status: 'submitted' })
    await expect(getTestBatchSummary(ids[1]!)).resolves.toMatchObject({ status: 'submitted' })
  })
})
