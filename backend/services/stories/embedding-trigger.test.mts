import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeScopedUuidCursor } from '@modules/pagination'
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

async function makeItem(embedded = true): Promise<{ id: string; hash: Buffer }> {
  const feed = await createTestRssFeed({})
  const hash = randomBytes(32)
  const id = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: await createTestUrlWithHostname(),
    guid: `embedding-trigger-${randomUUID()}`,
    itemData: { title: `Embedding trigger ${randomUUID()}` },
    contentSha256: hash,
    ...(embedded ? { embedding: makeRandomEmbedding(), tokens: 1 } : {}),
  })
  return { id, hash }
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
    const boundary = await makeItem(false)
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
      after: encodeScopedUuidCursor(boundary.id, 'stories:embedding-trigger:pending:id-asc'),
      limit: 1,
    })
    expect(recovered).toMatchObject({ enqueuedCount: 1, scannedCount: 1 })
    expect((await getRssFeedItemStoryEmbeddingTriggerState(item.id))?.marked_sha256).toEqual(
      item.hash,
    )
  })

  it('leaves the marker pending if marking fails after queue acceptance', async () => {
    const boundary = await makeItem(false)
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
    const after = encodeScopedUuidCursor(boundary.id, 'stories:embedding-trigger:pending:id-asc')
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
    const boundary = await makeItem(false)
    const first = await makeItem()
    const second = await makeItem()
    let after = encodeScopedUuidCursor(boundary.id, 'stories:embedding-trigger:pending:id-asc')
    const seen = new Set<string>()
    for (let page = 0; page < 20 && seen.size < 2; page += 1) {
      const result = await reconcilePendingStoryClusteringEmbeddingTriggers({ after, limit: 1 })
      expect(result.scannedCount).toBeLessThanOrEqual(1)
      if (result.nextCursor === null) break
      after = result.nextCursor
      if ((await getRssFeedItemStoryEmbeddingTriggerState(first.id))?.marked_sha256)
        seen.add(first.id)
      if ((await getRssFeedItemStoryEmbeddingTriggerState(second.id))?.marked_sha256)
        seen.add(second.id)
    }
    expect(seen).toEqual(new Set([first.id, second.id]))
  })
})
