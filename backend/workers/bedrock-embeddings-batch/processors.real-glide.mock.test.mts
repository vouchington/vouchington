import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Queue } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  readSingleEmbeddingBacklogSnapshot,
  shouldDeferSingleEmbedding,
} from '@queues/bedrock-embeddings/enqueues/single-backlog'
import { streamPendingPosts } from '@services/bedrock-embeddings-batch/entities/posts'
import { createTestUserDirect, deleteTestPost, insertTestPost } from '@voucha/test-helpers'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

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
