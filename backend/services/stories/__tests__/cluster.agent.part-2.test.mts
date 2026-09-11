import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'

import { createHash } from 'node:crypto'

import { clusterRssFeedItem } from '../cluster.mts'

import { getStoryById } from '../get.mts'

import type { CandidateRow } from '../cluster-candidates.mts'

import type { ClusteringAgentResult } from '@agents/story-clustering/openai-clustering-agent'

import {
  insertTestStory,
  setTestItemStoryId,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'

const mockAgent =
  vi.fn<(itemId: string, candidates: CandidateRow[]) => Promise<ClusteringAgentResult>>()

function clusterWithAgent(itemId: string) {
  return clusterRssFeedItem(itemId, { runStoryClusteringAgent: mockAgent })
}

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

function makeTestVecs(): { unit: number[]; near: number[] } {
  const raw = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0))
  const unit = raw.map(x => x / norm)

  const raw2 = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const dot2 = unit.reduce((s, x, i) => s + x * raw2[i], 0)
  const perpRaw = raw2.map((x, i) => x - dot2 * unit[i])
  const norm2 = Math.sqrt(perpRaw.reduce((s, x) => s + x * x, 0))
  const perp = perpRaw.map(x => x / norm2)

  const near = unit.map((x, i) => 0.97 * x + Math.sqrt(1 - 0.97 ** 2) * perp[i])
  return { unit, near }
}

type TestItem = { feedId: string; guid: string; itemId: string }

async function makeItem(options: {
  feedId: string
  embedding?: number[]
  publishedAt?: Date
}): Promise<TestItem> {
  const random = Math.random().toString(36).slice(2, 10)
  const guid = `cluster-mock-test-${random}`
  const link = `https://example.com/cluster-mock-${random}`
  const urlId = await createTestUrlWithHostname()
  const itemData: Record<string, unknown> = { title: `Cluster Mock Test Item ${random}`, link }
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

function makeIsolatedPublishedAt(dayOfMonth: number): Date {
  return new Date(Date.UTC(2000, 0, dayOfMonth))
}

describe('cluster', () => {
  beforeAll(async () => {
    await createTestRssFeed({})
  })

  beforeEach(() => {
    mockAgent.mockReset()
  })

  it('agent returns non-member official ID → not set on story', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const publishedAt = makeIsolatedPublishedAt(1)
    const neighbor = await makeItem({ feedId: feed.id, embedding: near, publishedAt })
    const item = await makeItem({ feedId: feed.id, embedding: unit, publishedAt })

    mockAgent.mockImplementationOnce((_itemId: string) =>
      Promise.resolve({
        should_cluster: true,
        reason: 'same event',
        cluster_item_ids: [neighbor.itemId],
        title: 'Story with bad official ID',
        official_rss_feed_item_id: '00000000-0000-0000-0000-000000000000',
        published_at: new Date().toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeDefined()

    const story = await getStoryById(result!.storyId)
    // Non-member ID → official not set
    expect(story!.official_rss_feed_item_id).toBeNull()
  })

  it(
    'concurrent clustering with overlapping candidates does not deadlock',
    { timeout: 3000 },
    async () => {
      const { unit, near } = makeTestVecs()
      const feed = await createTestRssFeed({})
      const publishedAt = makeIsolatedPublishedAt(2)

      // Shared candidates that both concurrent jobs will see
      await Promise.all([
        makeItem({ feedId: feed.id, embedding: near, publishedAt }),
        makeItem({ feedId: feed.id, embedding: near, publishedAt }),
        makeItem({ feedId: feed.id, embedding: near, publishedAt }),
      ])

      // Two items to be clustered simultaneously, both seeing the shared candidates
      const [itemA, itemB] = await Promise.all([
        makeItem({ feedId: feed.id, embedding: unit, publishedAt }),
        makeItem({ feedId: feed.id, embedding: unit, publishedAt }),
      ])
      // Both jobs return their full candidate sets — the classic overlapping-lock scenario.
      mockAgent.mockImplementation((_itemId: string, candidates: CandidateRow[]) =>
        Promise.resolve({
          should_cluster: true,
          reason: 'same event',
          cluster_item_ids: candidates.map(c => c.id),
          title: 'Concurrent Test Story',
          official_rss_feed_item_id: null,
          published_at: '2026-01-15T12:00:00Z',
        }),
      )

      // Both run concurrently — without the FOR UPDATE ORDER BY fix this deadlocks
      const [resultA, resultB] = await Promise.all([
        clusterWithAgent(itemA.itemId),
        clusterWithAgent(itemB.itemId),
      ])

      // At least one must succeed; the other may return null if its candidates were
      // already claimed by the first transaction (story_id IS NULL guard)
      const successes = [resultA, resultB].filter(r => r !== null)
      expect(successes.length).toBeGreaterThanOrEqual(1)
    },
  )

  it('agent returns empty cluster_item_ids → no story created', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const publishedAt = makeIsolatedPublishedAt(3)
    await makeItem({ feedId: feed.id, embedding: near, publishedAt })
    const item = await makeItem({ feedId: feed.id, embedding: unit, publishedAt })

    mockAgent.mockResolvedValueOnce({
      should_cluster: true,
      reason: 'confused agent',
      cluster_item_ids: [],
    } satisfies ClusteringAgentResult)

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeNull()
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestStory)
  void (0 as unknown as typeof setTestItemStoryId)
})
