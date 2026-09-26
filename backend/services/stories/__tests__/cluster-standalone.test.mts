import { describe, it, expect } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { clusterRssFeedItem } from '../cluster.mts'
import { fetchClusterItem } from '../cluster-fetch.mts'
import {
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  persistClassifierDecision,
} from '@services/classifiers'
import { STORY_CLUSTER_REASON } from '@agents/story-clustering'
import { getStoryById } from '../get.mts'

// Seeded by 0730-00-02-seed-story-clustering-classifier.mts; only ever SELECTed here, plus a
// decision inserted against a fresh per-test batchId, so sharing it across concurrent test workers
// is safe (same precedent as agents/story-clustering/choice-clustering.test.mts).
const STORY_CLUSTERING_SLUG = 'story-clustering-classifier'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

/**
 * Pre-seeds the classifier's decision under a known batchId rather than injecting a fake
 * structured-decision client into `clusterRssFeedItem` itself: `dispatchStoryClusteringDecision`
 * checks for an already-committed decision before ever loading candidates or dispatching, so this
 * deterministically forces an outcome without a broader test seam (see
 * agents/story-clustering/choice-clustering.test.mts's identical crash-recovery test).
 */
async function seedStoryClusteringDecision(options: {
  batchId: string
  incomingItemId: string
  rssFeedItemId: string
}): Promise<void> {
  const configuration =
    await getActiveClassifierConfigurationBySlugFromPrimary(STORY_CLUSTERING_SLUG)
  if (!configuration) throw new Error('story-clustering-classifier configuration not seeded')
  await persistClassifierDecision({
    batchId: options.batchId,
    classifierId: configuration.classifierId,
    promptVersionId: configuration.promptVersionId,
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    subject: { postId: null, rssFeedItemId: options.incomingItemId },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'rss_feed_item' as const,
            rssFeedItemId: options.rssFeedItemId,
            storedCandidateId: null,
            probability: 0.95,
            rawResponse: { simulated: 'rss_feed_item test' },
          },
        ],
      },
    ],
  })
}

/**
 * Returns two embedding vectors: a random 1024-d unit vector, and one at cosine distance ≈ 0.1
 * (well under the 0.5 threshold). Random per call to avoid contamination from prior test runs
 * that left rows with the same fixed embeddings in the DB.
 */
function makeTestVecs(): { unit: number[]; near: number[] } {
  const raw = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0))
  const unit = raw.map(x => x / norm)

  const raw2 = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const dot2 = unit.reduce((s, x, i) => s + x * raw2[i], 0)
  const perpRaw = raw2.map((x, i) => x - dot2 * unit[i])
  const norm2 = Math.sqrt(perpRaw.reduce((s, x) => s + x * x, 0))
  const perp = perpRaw.map(x => x / norm2)

  // near = 0.9*unit + sqrt(1-0.81)*perp  →  cos(unit, near) = 0.9  →  distance = 0.1
  const near = unit.map((x, i) => 0.9 * x + Math.sqrt(1 - 0.81) * perp[i])

  return { unit, near }
}

type TestItem = { feedId: string; guid: string; itemId: string }

async function makeItem(options: {
  feedId: string
  embedding?: number[]
  publishedAt?: Date
}): Promise<TestItem> {
  const random = Math.random().toString(36).slice(2, 10)
  const guid = `cluster-test-${random}`
  const link = `https://example.com/cluster-${random}`
  const urlId = await createTestUrlWithHostname()
  const itemData: Record<string, unknown> = { title: `Cluster Test Item ${random}`, link }
  if (options.publishedAt) {
    itemData.isoDate = options.publishedAt.toISOString()
  }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: options.feedId,
    urlId,
    guid,
    itemData,
    contentSha256: sha256(itemData),
    embedding: options.embedding,
    tokens: options.embedding ? 10 : undefined,
  })
  return { feedId: options.feedId, guid, itemId }
}

describe('story clustering standalone outcome', () => {
  it('creates a new story from the incoming item and selected candidate', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const earlier = new Date(Date.now() - 60 * 60 * 1000)
    const candidate = await makeItem({ feedId: feed.id, embedding: near, publishedAt: earlier })
    const incoming = await makeItem({ feedId: feed.id, embedding: unit })

    const batchId = randomUUID()
    await seedStoryClusteringDecision({
      batchId,
      incomingItemId: incoming.itemId,
      rssFeedItemId: candidate.itemId,
    })

    const result = await clusterRssFeedItem(incoming.itemId, batchId)
    expect(result).not.toBeNull()
    expect(result!.created).toBe(true)

    const story = await getStoryById(result!.storyId)
    expect(story).not.toBeNull()
    // Title comes only from the selected candidate's own title, never the incoming item's.
    expect(story!.title).toContain('Cluster Test Item')
    expect(story!.published_at).not.toBeNull()
    expect(story!.published_at!.getTime()).toBe(earlier.getTime())
    expect(story!.cluster_reason).toBe(STORY_CLUSTER_REASON)

    const [incomingRow, candidateRow] = await Promise.all([
      fetchClusterItem(incoming.itemId),
      fetchClusterItem(candidate.itemId),
    ])
    expect(incomingRow!.story_id).toBe(result!.storyId)
    expect(candidateRow!.story_id).toBe(result!.storyId)
  })

  it('loses the race atomically when the candidate is claimed first', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const candidate = await makeItem({ feedId: feed.id, embedding: near })
    const incoming = await makeItem({ feedId: feed.id, embedding: unit })

    const batchId = randomUUID()
    await seedStoryClusteringDecision({
      batchId,
      incomingItemId: incoming.itemId,
      rssFeedItemId: candidate.itemId,
    })

    // Simulate the candidate losing to a concurrent claim between the decision being made and
    // `createClusteredStoryPair`'s locked read: the ordered `SELECT ... FOR UPDATE` must see this
    // and bail out before creating any story, rather than silently creating one with only the
    // incoming item (the old code's confirmed bug).
    const otherStory = await insertTestStory()
    await setTestItemStoryId(candidate.itemId, otherStory.id)

    const result = await clusterRssFeedItem(incoming.itemId, batchId)
    expect(result).toBeNull()

    const incomingRow = await fetchClusterItem(incoming.itemId)
    expect(incomingRow!.story_id).toBeNull()
  })
})
