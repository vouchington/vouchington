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

describe('cluster', () => {
  beforeAll(async () => {
    await createTestRssFeed({})
  })

  beforeEach(() => {
    mockAgent.mockReset()
  })

  it('agent rejects cluster → no story created', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    await makeItem({ feedId: feed.id, embedding: near })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    mockAgent.mockResolvedValueOnce({
      should_cluster: false,
      reason: 'different events',
      cluster_item_ids: [],
    } satisfies ClusteringAgentResult)

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeNull()
  })

  it('agent accepts cluster with standalone neighbors → creates new story with title + published_at', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    await makeItem({ feedId: feed.id, embedding: near })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    const publishedAt = new Date('2026-01-15T12:00:00Z')
    mockAgent.mockImplementationOnce((_itemId: string, candidates: CandidateRow[]) =>
      Promise.resolve({
        should_cluster: true,
        reason: 'same event',
        cluster_item_ids: candidates.map(c => c.id),
        title: 'Agent-Generated Headline',
        official_rss_feed_item_id: null,
        published_at: publishedAt.toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeDefined()
    expect(result!.created).toBe(true)

    const story = await getStoryById(result!.storyId)
    expect(story).toBeDefined()
    expect(story!.title).toBe('Agent-Generated Headline')
    expect(story!.published_at?.toISOString()).toBe(publishedAt.toISOString())
  })

  it('agent cluster reason is stored as cluster_reason on the story', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    await makeItem({ feedId: feed.id, embedding: near })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    const clusterReason = 'Both articles cover the same product launch announcement'
    mockAgent.mockImplementationOnce((_itemId: string, candidates: CandidateRow[]) =>
      Promise.resolve({
        should_cluster: true,
        reason: clusterReason,
        cluster_item_ids: candidates.map(c => c.id),
        title: 'Product Launch Story',
        official_rss_feed_item_id: null,
        published_at: new Date().toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeDefined()
    expect(result!.created).toBe(true)

    const story = await getStoryById(result!.storyId)
    expect(story!.cluster_reason).toBe(clusterReason)
  })

  it('agent accepts cluster with neighbor in existing story → joins existing story', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const existingStory = await insertTestStory({ title: 'Existing Story' })

    const neighbor = await makeItem({ feedId: feed.id, embedding: near })
    await setTestItemStoryId(neighbor.itemId, existingStory.id)

    const item = await makeItem({ feedId: feed.id, embedding: unit })

    mockAgent.mockImplementationOnce((_itemId: string, candidates: CandidateRow[]) =>
      Promise.resolve({
        should_cluster: true,
        reason: 'same event',
        cluster_item_ids: candidates.map(c => c.id),
        title: 'Joined Story',
        official_rss_feed_item_id: null,
        published_at: new Date().toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeDefined()
    expect(result!.storyId).toBe(existingStory.id)
    expect(result!.created).toBe(false)
  })

  it('idempotent — already-clustered item returns same story without calling agent', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const existingStory = await insertTestStory()
    const [a] = await Promise.all([
      makeItem({ feedId: feed.id, embedding: unit }),
      makeItem({ feedId: feed.id, embedding: near }),
    ])
    await setTestItemStoryId(a.itemId, existingStory.id)

    mockAgent.mockClear()

    const result = await clusterWithAgent(a.itemId)
    expect(result).toBeDefined()
    expect(result!.storyId).toBe(existingStory.id)
    expect(result!.created).toBe(false)
    // Agent should NOT be called since item already has story_id
    expect(mockAgent).not.toHaveBeenCalled()
  })

  it('joining an existing story preserves the story title', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})
    const random = Math.random().toString(36).slice(2, 10)
    const existingTitle = `Preserved Title ${random}`
    const existingStory = await insertTestStory({ title: existingTitle })
    const neighbor = await makeItem({ feedId: feed.id, embedding: near })
    await setTestItemStoryId(neighbor.itemId, existingStory.id)
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    mockAgent.mockImplementationOnce((_itemId: string, candidates: CandidateRow[]) =>
      Promise.resolve({
        should_cluster: true,
        reason: 'same event',
        cluster_item_ids: candidates.map(c => c.id),
        title: 'Agent Override Title (should not apply)',
        official_rss_feed_item_id: null,
        published_at: new Date().toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result!.created).toBe(false)
    const story = await getStoryById(result!.storyId)
    expect(story!.title).toBe(existingTitle)
  })

  it('agent sets validated official_rss_feed_item_id on new story', async () => {
    const { unit, near } = makeTestVecs()
    const feed = await createTestRssFeed({})

    await makeItem({ feedId: feed.id, embedding: near })
    const item = await makeItem({ feedId: feed.id, embedding: unit })

    mockAgent.mockImplementationOnce((_itemId: string, candidates: CandidateRow[]) =>
      Promise.resolve({
        should_cluster: true,
        reason: 'same event',
        cluster_item_ids: candidates.map(c => c.id),
        title: 'Official Source Story',
        official_rss_feed_item_id: item.itemId,
        published_at: new Date().toISOString(),
      }),
    )

    const result = await clusterWithAgent(item.itemId)
    expect(result).toBeDefined()

    const story = await getStoryById(result!.storyId)
    expect(story!.official_rss_feed_item_id).toBe(item.itemId)
  })
})
