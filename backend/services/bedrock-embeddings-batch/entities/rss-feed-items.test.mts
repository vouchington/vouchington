import { randomBytes } from 'node:crypto'
import { decodeUuidCursor, encodeScopedUuidCursor, isSimpleCursor } from '@modules/pagination'
import { classifierRunDispatcherJobId } from '@queues/ai-agents/enqueues/classifier-run'
import { ai_agents } from '@queues/ai-agents/queues'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertTestEmbeddings, makeRandomEmbedding, readAllQueueJobs } from '@voucha/test-helpers'
import {
  createStoryClusteringItem,
  STORY_CLUSTERING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { describe, expect, it } from 'vitest'
import {
  applyRssFeedItemBatchUpdates,
  copyExistingRssFeedItemEmbeddings,
} from './rss-feed-items.mts'

const SCOPE = 'embedding-reconciliation:rss_feed_items:id-asc'

function cursorBefore(id: string): string {
  const before = decodeUuidCursor(encodeUuidCursorBefore(id), isSimpleCursor, 'Invalid cursor')
  return encodeScopedUuidCursor(before.id, SCOPE)
}

async function storyClusteringDispatched(rssFeedItemId: string): Promise<boolean> {
  const jobId = classifierRunDispatcherJobId({
    classifier: STORY_CLUSTERING_CLASSIFIER_SLUG,
    postId: null,
    rssFeedItemId,
  })
  return (await readAllQueueJobs(ai_agents)).some(job => job.id === jobId)
}

async function pendingItem() {
  const feed = await createTestRssFeed({})
  return createStoryClusteringItem({ feedId: feed.id })
}

describe('RSS feed item embedding paths start story clustering', () => {
  it('starts it for an item whose batch embedding was stored', async () => {
    const item = await pendingItem()

    await applyRssFeedItemBatchUpdates([
      {
        entity_id: item.itemId,
        content_sha256: item.inputSha256,
        embedding: makeRandomEmbedding(),
        input_token_count: 5,
      },
    ])

    expect(await storyClusteringDispatched(item.itemId)).toBe(true)
  })

  it('does not start it for an item whose content moved on before the batch result was stored', async () => {
    const item = await pendingItem()

    await applyRssFeedItemBatchUpdates([
      {
        entity_id: item.itemId,
        content_sha256: randomBytes(32),
        embedding: makeRandomEmbedding(),
        input_token_count: 5,
      },
    ])

    expect(await storyClusteringDispatched(item.itemId)).toBe(false)
  })

  it('starts it for an item embedded by copying a cached embedding', async () => {
    const item = await pendingItem()
    await insertTestEmbeddings([
      { content_sha256: item.inputSha256, embedding: makeRandomEmbedding() },
    ])

    const page = await copyExistingRssFeedItemEmbeddings({
      after: cursorBefore(item.itemId),
      limit: 1,
    })

    expect(page.updatedIds).toEqual([item.itemId])
    expect(await storyClusteringDispatched(item.itemId)).toBe(true)
  })

  it('does not start it for an item with no cached embedding to copy', async () => {
    const item = await pendingItem()

    const page = await copyExistingRssFeedItemEmbeddings({
      after: cursorBefore(item.itemId),
      limit: 1,
    })

    expect(page.updatedIds).toEqual([])
    expect(await storyClusteringDispatched(item.itemId)).toBe(false)
  })
})
