import { describe, it, expect, beforeAll } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { clusterRssFeedItem } from '../cluster.mts'
import { adminAssignItemToStory } from '../assign.mts'
import { findClusterCandidates } from '../cluster-candidates.mts'
import { fetchClusterItem } from '../cluster-fetch.mts'
import {
  setTestItemStoryLocked,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setRssFeedOwningTopicVoteScore,
  addRssFeedItemSource,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { updateRssFeedById } from '@services/rss-feeds'
import { evaluateRssFeedDiscoverability } from '@services/rss-feeds/evaluate-discoverability'
import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  persistClassifierDecision,
} from '@services/classifiers'

// Seeded by 0730-00-02-seed-story-clustering-classifier.mts; only ever SELECTed here, plus a
// decision inserted against a fresh per-test batchId, so sharing it across concurrent test workers
// is safe (same precedent as agents/story-clustering/choice-clustering.test.mts).
const STORY_CLUSTERING_SLUG = 'story-clustering-classifier'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

type SeededClusterCandidate =
  | { kind: 'story'; storyId: string }
  | { kind: 'rss_feed_item'; rssFeedItemId: string }

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
  candidate: SeededClusterCandidate
}): Promise<void> {
  const configuration =
    await getActiveClassifierConfigurationBySlugFromPrimary(STORY_CLUSTERING_SLUG)
  if (!configuration) throw new Error('story-clustering-classifier configuration not seeded')
  const result =
    options.candidate.kind === 'story'
      ? {
          candidateKind: 'story' as const,
          storyId: options.candidate.storyId,
          storedCandidateId: null,
          probability: 0.95,
          rawResponse: { simulated: 'story test' },
        }
      : {
          candidateKind: 'rss_feed_item' as const,
          rssFeedItemId: options.candidate.rssFeedItemId,
          storedCandidateId: null,
          probability: 0.95,
          rawResponse: { simulated: 'rss_feed_item test' },
        }
  await persistClassifierDecision({
    batchId: options.batchId,
    classifierId: configuration.classifierId,
    promptVersionId: configuration.promptVersionId,
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    subject: { postId: null, rssFeedItemId: options.incomingItemId },
    calls: [{ shardOrdinal: 0, results: [result] }],
  })
}

/**
 * Returns three embedding vectors:
 *   unit: a random 1024-d unit vector (unique per call — different each test run)
 *   near: cosine distance ≈ 0.1 from unit (well under 0.5 threshold)
 *   far:  explicitly perpendicular to unit (cosine distance = 1.0, above threshold)
 *
 * Using random unit vectors instead of fixed axes prevents contamination from prior
 * test runs that left rows with the same fixed embeddings in the DB.
 */
function makeTestVecs(): { unit: number[]; near: number[]; far: number[] } {
  // Random 1024-d unit vector
  const raw = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0))
  const unit = raw.map(x => x / norm)

  // Build an orthonormal vector to unit via Gram-Schmidt on a fresh random vector
  const raw2 = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const dot2 = unit.reduce((s, x, i) => s + x * raw2[i], 0)
  const perpRaw = raw2.map((x, i) => x - dot2 * unit[i])
  const norm2 = Math.sqrt(perpRaw.reduce((s, x) => s + x * x, 0))
  const perp = perpRaw.map(x => x / norm2)

  // near = 0.9*unit + sqrt(1-0.81)*perp  →  cos(unit, near) = 0.9  →  distance = 0.1
  const near = unit.map((x, i) => 0.9 * x + Math.sqrt(1 - 0.81) * perp[i])

  // far = perp  →  cos(unit, far) = 0  →  distance = 1.0
  const far = perp

  return { unit, near, far }
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

let sharedFeed: { id: string }

describe('story clustering', () => {
  beforeAll(async () => {
    sharedFeed = await createTestRssFeed({})
  })

  it('no embedding → skip clustering', async () => {
    const item = await makeItem({ feedId: sharedFeed.id })
    const result = await clusterRssFeedItem(item.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('does not deadlock when clustering and admin assignment overlap on one item', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const story = await insertTestStory()
    const existing = await makeItem({ feedId: feed.id, embedding: near })
    await setTestItemStoryId(existing.itemId, story.id)
    const pending = await makeItem({ feedId: feed.id, embedding: unit })

    const batchId = randomUUID()
    await seedStoryClusteringDecision({
      batchId,
      incomingItemId: pending.itemId,
      candidate: { kind: 'story', storyId: story.id },
    })

    const run = Promise.all([
      clusterRssFeedItem(pending.itemId, batchId),
      adminAssignItemToStory(story.id, pending.itemId),
    ])
    await expect(
      Promise.race([
        run,
        new Promise<never>((_resolve, reject) => {
          AbortSignal.timeout(5_000).addEventListener(
            'abort',
            () => reject(new Error('overlapping assignment deadlocked')),
            { once: true },
          )
        }),
      ]),
    ).resolves.toBeDefined()
  })

  it('no matching neighbor (only far item) → no story created', async () => {
    const { unit, far } = makeTestVecs()
    const feed = await createTestRssFeed({})
    // Only a perpendicular neighbor — cosine distance = 1.0 ≥ threshold
    await makeItem({ feedId: feed.id, embedding: far })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    const result = await clusterRssFeedItem(item.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('story_locked_at on item → skip clustering', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const [a, b] = await Promise.all([
      makeItem({ feedId: feed.id, embedding: unit }),
      makeItem({ feedId: feed.id, embedding: near }),
    ])
    // Lock a — should skip even though b is a close neighbor
    await Promise.all([setTestItemStoryLocked(a.itemId, true), Promise.resolve(b)])

    const result = await clusterRssFeedItem(a.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('distance above threshold → no match', async () => {
    const { unit, far } = makeTestVecs()
    const feed = await createTestRssFeed({})
    // Far = perpendicular to unit (distance = 1.0 ≥ 0.5 threshold)
    await makeItem({ feedId: feed.id, embedding: far })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    const result = await clusterRssFeedItem(item.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('window filtering → item 40 days old not matched', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const now = new Date()
    const ancient = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)

    // Near item published 40 days ago — outside default 4-day window
    await makeItem({ feedId: feed.id, embedding: near, publishedAt: ancient })
    const item = await makeItem({ feedId: feed.id, embedding: unit, publishedAt: now })

    const result = await clusterRssFeedItem(item.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('source feed hidden from discovery skips clustering', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    // Create a near neighbor so candidates would exist if suppression were absent
    const [a, _b] = await Promise.all([
      makeItem({ feedId: feed.id, embedding: unit }),
      makeItem({ feedId: feed.id, embedding: near }),
    ])

    await updateRssFeedById(feed.id, { discoverable: false })

    // a is not cluster-eligible → early exit despite near neighbor
    const result = await clusterRssFeedItem(a.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('topic score below discoverability threshold skips clustering after evaluation', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const [a, _b] = await Promise.all([
      makeItem({ feedId: feed.id, embedding: unit }),
      makeItem({ feedId: feed.id, embedding: near }),
    ])

    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    await evaluateRssFeedDiscoverability(feed.id)

    const result = await clusterRssFeedItem(a.itemId, randomUUID())
    expect(result).toBeNull()
  })

  it('item with hidden source is excluded from candidates', async () => {
    const { unit, near } = makeTestVecs()

    const feed1 = await createTestRssFeed({})
    await updateRssFeedById(feed1.id, { discoverable: false })
    const itemA = await makeItem({ feedId: feed1.id, embedding: near })

    const feed2 = await createTestRssFeed({})
    const itemB = await makeItem({ feedId: feed2.id, embedding: unit })

    // Fetch the ClusterItemRow for B so we can call findClusterCandidates directly
    const itemBRow = await fetchClusterItem(itemB.itemId)
    expect(itemBRow).not.toBeNull()
    expect(itemBRow!.is_cluster_eligible).toBe(true)

    const candidates = await findClusterCandidates(itemBRow!)
    const candidateIds = candidates.map(c => c.id)
    expect(candidateIds).not.toContain(itemA.itemId)
  })

  it('multi-source item with one hidden source remains cluster-eligible', async () => {
    const { unit } = makeTestVecs()

    const feed1 = await createTestRssFeed({})
    const feed2 = await createTestRssFeed({})
    await updateRssFeedById(feed1.id, { discoverable: false })

    const item = await makeItem({ feedId: feed1.id, embedding: unit })

    await addRssFeedItemSource(feed2.id, item.itemId)

    const itemRow = await fetchClusterItem(item.itemId)
    expect(itemRow).not.toBeNull()
    // With at least one unsuppressed source, the item is still cluster-eligible
    expect(itemRow!.is_cluster_eligible).toBe(true)
  })
})
