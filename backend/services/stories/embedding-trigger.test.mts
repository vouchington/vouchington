import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decodeUuidCursor, encodeScopedUuidCursor, isSimpleCursor } from '@modules/pagination'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { expireTestDedupEntry } from '../../../test-helpers/glide-mq-vitest-dedup.mts'
import { ai_agents } from '@queues/ai-agents/queues'
import { enqueueBulkStoryClusteringStrict } from '@queues/ai-agents/enqueues/story-clustering'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import {
  createTestUrlWithHostname,
  getRssFeedItemStoryEmbeddingTriggerState,
  insertTestRssFeedItem,
  makeRandomEmbedding,
  readAllQueueJobs,
  setRssFeedItemEmbeddingContentSha256ForTest,
} from '@voucha/test-helpers'
import {
  reconcilePendingStoryClusteringEmbeddingTriggers,
  triggerStoryClusteringForCurrentEmbeddings,
} from './embedding-trigger.mts'

async function makeItem(embedded = true, itemId?: string): Promise<{ id: string; hash: Buffer }> {
  const feed = await createTestRssFeed({})
  const hash = randomBytes(32)
  const id = await insertTestRssFeedItem({
    id: itemId,
    rssFeedId: feed.id,
    urlId: await createTestUrlWithHostname(),
    guid: `embedding-trigger-${randomUUID()}`,
    itemData: { title: `Embedding trigger ${randomUUID()}` },
    contentSha256: hash,
    ...(embedded ? { embedding: makeRandomEmbedding(), tokens: 1 } : {}),
  })
  return { id, hash }
}

function recoveryCursorBefore(id: string): string {
  const before = decodeUuidCursor(encodeUuidCursorBefore(id), isSimpleCursor, 'Invalid cursor')
  return encodeScopedUuidCursor(before.id, 'stories:embedding-trigger:pending:id-asc')
}

describe('RSS embedding story trigger', () => {
  it('marks a current embedding after strict queue acceptance and then does no work', async () => {
    const item = await makeItem()
    await expect(triggerStoryClusteringForCurrentEmbeddings([item.id])).resolves.toBe(1)
    await expect(getRssFeedItemStoryEmbeddingTriggerState(item.id)).resolves.toMatchObject({
      marked_sha256: item.hash,
    })
    await expect(triggerStoryClusteringForCurrentEmbeddings([item.id])).resolves.toBe(0)
    const jobs = await readAllQueueJobs(ai_agents)
    expect(
      jobs.filter(job => 'rss_feed_item_id' in job.data && job.data.rss_feed_item_id === item.id),
    ).toHaveLength(1)
  })

  it('marks only accepted items when a bulk input is deduplicated', async () => {
    const duplicate = await makeItem()
    const fresh = await makeItem()
    await enqueueBulkStoryClusteringStrict([
      { rss_feed_item_id: duplicate.id, inputSha256Hex: duplicate.hash.toString('hex') },
    ])

    await expect(
      triggerStoryClusteringForCurrentEmbeddings([duplicate.id, fresh.id]),
    ).resolves.toBe(1)
    expect((await getRssFeedItemStoryEmbeddingTriggerState(duplicate.id))?.marked_sha256).toBeNull()
    expect((await getRssFeedItemStoryEmbeddingTriggerState(fresh.id))?.marked_sha256).toEqual(
      fresh.hash,
    )
  })

  it('leaves the marker pending when enqueue throws', async () => {
    const item = await makeItem()
    await expect(
      triggerStoryClusteringForCurrentEmbeddings([item.id], {
        enqueueStrict: async () => {
          throw new Error('queue unavailable')
        },
      }),
    ).rejects.toThrow('queue unavailable')
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toBeNull()
    const recovered = await reconcilePendingStoryClusteringEmbeddingTriggers({
      after: recoveryCursorBefore(item.id),
      limit: 1,
    })
    expect(recovered).toMatchObject({ enqueuedCount: 1, scannedCount: 1 })
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toEqual(
      item.hash,
    )
  })

  it('leaves the marker pending if marking fails after queue acceptance', async () => {
    const item = await makeItem()
    await expect(
      triggerStoryClusteringForCurrentEmbeddings([item.id], {
        markAccepted: async () => {
          throw new Error('marker unavailable')
        },
      }),
    ).rejects.toThrow('marker unavailable')
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toBeNull()
    const jobs = await readAllQueueJobs(ai_agents)
    const acceptedJob = jobs.find(
      job => 'rss_feed_item_id' in job.data && job.data.rss_feed_item_id === item.id,
    )
    expect(acceptedJob).toBeDefined()
    const after = recoveryCursorBefore(item.id)
    const deduped = await reconcilePendingStoryClusteringEmbeddingTriggers({ after, limit: 1 })
    expect(deduped).toMatchObject({ enqueuedCount: 0, scannedCount: 1 })
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toBeNull()

    const dedupId = acceptedJob!.opts.deduplication?.id
    expect(dedupId).toBeDefined()
    expireTestDedupEntry(ai_agents.name, dedupId!)
    const recovered = await reconcilePendingStoryClusteringEmbeddingTriggers({ after, limit: 1 })
    expect(recovered).toMatchObject({ enqueuedCount: 1, scannedCount: 1 })
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toEqual(
      item.hash,
    )
  })

  it('does not mark an old embedding if content changes during enqueue', async () => {
    const item = await makeItem()
    const nextHash = randomBytes(32)
    await expect(
      triggerStoryClusteringForCurrentEmbeddings([item.id], {
        enqueueStrict: async items => {
          const accepted = await enqueueBulkStoryClusteringStrict(items)
          await setRssFeedItemEmbeddingContentSha256ForTest(item.id, nextHash)
          return accepted
        },
      }),
    ).resolves.toBe(1)
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toBeNull()
    await expect(triggerStoryClusteringForCurrentEmbeddings([item.id])).resolves.toBe(0)
  })

  it('scans one pending marker page and resumes with an opaque cursor', async () => {
    const timestamp = Date.now().toString(16).padStart(12, '0')
    const base = `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${randomBytes(5).toString('hex')}`
    const first = await makeItem(true, `${base}00`)
    const second = await makeItem(true, `${base}01`)
    const firstPage = await reconcilePendingStoryClusteringEmbeddingTriggers({
      after: recoveryCursorBefore(first.id),
      limit: 1,
    })
    expect(firstPage.scannedCount).toBe(1)
    expect(firstPage.nextCursor).not.toBeNull()
    expect((await getRssFeedItemStoryEmbeddingTriggerState(first.id))?.marked_sha256).toEqual(
      first.hash,
    )
    expect((await getRssFeedItemStoryEmbeddingTriggerState(second.id))?.marked_sha256).toBeNull()

    const secondPage = await reconcilePendingStoryClusteringEmbeddingTriggers({
      after: firstPage.nextCursor!,
      limit: 1,
    })
    expect(secondPage.scannedCount).toBe(1)
    expect((await getRssFeedItemStoryEmbeddingTriggerState(second.id))?.marked_sha256).toEqual(
      second.hash,
    )
  })
})
