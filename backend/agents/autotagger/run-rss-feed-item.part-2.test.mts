import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'
import {
  runAutotaggerOnRssFeedItem,
  wouldAutotagRssFeedItemCallOpenAI,
} from './run-rss-feed-item.mts'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import {
  insertRssFeedItemAutotaggingResult,
  hasExistingRssFeedItemAutotagging,
  autotaggerPaidLimitsConfig,
} from '@services/autotagger'
import {
  createTestUser,
  createTestMembership,
  insertTestRssFeedItem,
  insertEntityRelation,
  followTopicById,
  createRandomString,
  setupTestAutotaggerAgent,
  createTestTopic,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { setRssFeedDiscoverabilityAsSystem } from '@services/rss-feeds'
import { addUrl } from '@services/urls/upsert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'

// Covers #8246's RSS tiering: the "enabled" kill-switch (a full stop for both the LLM and
// collaborative passes), discoverability gating (LLM only), and the no-LLM collaborative-follower
// topic pass. Basic wiring tests live in run-rss-feed-item.test.mts.

let activePromptId: string
let testRssFeedId: string

async function insertRssFeedItemFixture(
  rssFeedId: string,
): Promise<{ itemId: string; guid: string }> {
  const guid = `run-test-item-${createRandomString(12)}`
  const urlEntry = await addUrl(null, `https://run-test-${createRandomString(8)}.example.com/item`)
  const itemId = await insertTestRssFeedItem({
    rssFeedId,
    urlId: urlEntry!.id,
    guid,
    itemData: { link: 'https://example.com', guid, title: 'RSS Item Title' },
    contentSha256: Buffer.alloc(32),
  })
  return { itemId, guid }
}

async function createPaidFollowerForFeed(feedId: string, plan: 'plus' | 'pro') {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan })
  await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)
  return user
}

// The collaborative-topic pass inside runAutotaggerOnRssFeedItem creates a category relation via
// applyCollaborativeTopicRelations, which enqueues its vote-stats recompute fire-and-forget (see
// services/elections-votes/CLAUDE.md's "intentionally asynchronous" design). The view column
// backing `categories` is gated on that recompute having landed, so every call site here that
// expects a collaborative topic chip must wait for it before reading category data back. Poll the
// observable read instead of listening on the worker's job-completion event -- mirrors the same
// precedent in backend/services/rss-feed-items/collaborative-topic-relations.test.mts and
// categories.relations.test.mts (backend/services/* must never depend on backend/workers/* per
// workers/CLAUDE.md).
async function expectCollaborativeTopicChip(itemId: string, topicId: string): Promise<void> {
  await expect
    .poll(async () => {
      const item = await getRssFeedItemById(itemId)
      return item?.categories.some(c => c.topic?.id === topicId)
    })
    .toBe(true)
}

describe('runAutotaggerOnRssFeedItem tiering', () => {
  beforeAll(async () => {
    const activePrompt = await setupTestAutotaggerAgent()
    activePromptId = activePrompt.id

    const feed = await createTestRssFeed({})
    testRssFeedId = feed.id
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the LLM with max_topics: 3 and applies collaborative topics for a discoverable item', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })
    const { itemId, guid } = await insertRssFeedItemFixture(testRssFeedId)

    const collabTopic = await createTestTopic({})
    const follower = await createPaidFollowerForFeed(testRssFeedId, 'plus')
    await followTopicById(follower.id, collabTopic.id)

    const item: Partial<ViewRssFeedItem> = { id: itemId, guid, data: { link: 'x', guid } }
    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
      searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
    })

    expect(result).not.toBeNull()
    expect(result!.skipped).toBe(false)
    expect(callOpenAIAutotagger).toHaveBeenCalledWith(
      expect.any(Object),
      'rss_feed_item',
      itemId,
      expect.any(String),
      expect.objectContaining({ max_topics: 3 }),
    )
    expect(await hasExistingRssFeedItemAutotagging(itemId)).toBe(true)

    await expectCollaborativeTopicChip(itemId, collabTopic.id)
  })

  it('skips the LLM but still applies collaborative topics and writes the marker for a non-discoverable item', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })
    const nonDiscoverableFeed = await createTestRssFeed({})
    await setRssFeedDiscoverabilityAsSystem({
      rssFeedId: nonDiscoverableFeed.id,
      enabled: false,
      reason: 'test: non-discoverable fixture',
    })

    const { itemId, guid } = await insertRssFeedItemFixture(nonDiscoverableFeed.id)
    const collabTopic = await createTestTopic({})
    const follower = await createPaidFollowerForFeed(nonDiscoverableFeed.id, 'pro')
    await followTopicById(follower.id, collabTopic.id)

    const item: Partial<ViewRssFeedItem> = { id: itemId, guid, data: { link: 'x', guid } }
    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
      searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
    })

    expect(result).not.toBeNull()
    expect(result!.skipped).toBe(false)
    expect(callOpenAIAutotagger).not.toHaveBeenCalled()
    expect(await hasExistingRssFeedItemAutotagging(itemId)).toBe(true)

    await expectCollaborativeTopicChip(itemId, collabTopic.id)
  })

  it('skips the LLM but still applies collaborative topics when the LLM topic budget is configured to zero', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })
    const { itemId, guid } = await insertRssFeedItemFixture(testRssFeedId)
    const collabTopic = await createTestTopic({})
    const follower = await createPaidFollowerForFeed(testRssFeedId, 'plus')
    await followTopicById(follower.id, collabTopic.id)

    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_discoverable_llm_max_topics: 0,
    })
    try {
      const item: Partial<ViewRssFeedItem> = { id: itemId, guid, data: { link: 'x', guid } }
      const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
        callOpenAIAutotagger,
        searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
      })

      // A zero-topic LLM budget means every add-topic call would be rejected anyway -- skip the
      // paid OpenAI run entirely rather than pay for a call whose output can never land.
      expect(result).not.toBeNull()
      expect(result!.skipped).toBe(false)
      expect(callOpenAIAutotagger).not.toHaveBeenCalled()
      expect(await hasExistingRssFeedItemAutotagging(itemId)).toBe(true)

      await expectCollaborativeTopicChip(itemId, collabTopic.id)
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
        rss_discoverable_llm_max_topics: 3,
      })
    }
  })

  it('skips both the LLM and the collaborative pool when the enabled kill-switch is off, but still writes the marker', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })
    const { itemId, guid } = await insertRssFeedItemFixture(testRssFeedId)
    const collabTopic = await createTestTopic({})
    const follower = await createPaidFollowerForFeed(testRssFeedId, 'plus')
    await followTopicById(follower.id, collabTopic.id)

    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: false })
    try {
      const item: Partial<ViewRssFeedItem> = { id: itemId, guid, data: { link: 'x', guid } }
      const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
        callOpenAIAutotagger,
        searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
      })

      // "enabled" is a full stop for autotagger-attributed writes -- neither the LLM nor the
      // collaborative pass runs, even though this item is discoverable and has a paid follower.
      expect(result).not.toBeNull()
      expect(callOpenAIAutotagger).not.toHaveBeenCalled()
      expect(await hasExistingRssFeedItemAutotagging(itemId)).toBe(true)

      const stored = await getRssFeedItemById(itemId)
      expect(stored?.categories.some(c => c.topic?.id === collabTopic.id)).toBe(false)
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: true })
    }
  })

  it('skips both the LLM and the collaborative pool when a result already exists', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })
    const { itemId, guid } = await insertRssFeedItemFixture(testRssFeedId)
    await insertRssFeedItemAutotaggingResult(itemId, Buffer.alloc(32), activePromptId, [])

    const collabTopic = await createTestTopic({})
    const follower = await createPaidFollowerForFeed(testRssFeedId, 'plus')
    await followTopicById(follower.id, collabTopic.id)

    const item: Partial<ViewRssFeedItem> = { id: itemId, guid, data: { link: 'x', guid } }
    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
    })

    expect(result).toBeNull()
    expect(callOpenAIAutotagger).not.toHaveBeenCalled()

    const stored = await getRssFeedItemById(itemId)
    expect(stored?.categories.some(c => c.topic?.id === collabTopic.id)).toBe(false)
  })
})

// #8773 round-14 finding 2: this predicate is the spend-cap gate's only way
// (backend/workers/ai-agents/workers/core.mts) to tell an item that would call OpenAI apart from
// one that would only run the spend-free collaborative-topic pass. Mirrors the tiering cases above
// one-for-one, but asserts the predicate directly instead of through a full run.
describe('wouldAutotagRssFeedItemCallOpenAI', () => {
  it('returns false when a result already exists', async () => {
    const { itemId } = await insertRssFeedItemFixture(testRssFeedId)
    await insertRssFeedItemAutotaggingResult(itemId, Buffer.alloc(32), activePromptId, [])

    expect(await wouldAutotagRssFeedItemCallOpenAI(itemId)).toBe(false)
  })

  it('returns false for a non-discoverable item', async () => {
    const nonDiscoverableFeed = await createTestRssFeed({})
    await setRssFeedDiscoverabilityAsSystem({
      rssFeedId: nonDiscoverableFeed.id,
      enabled: false,
      reason: 'test: non-discoverable fixture',
    })
    const { itemId } = await insertRssFeedItemFixture(nonDiscoverableFeed.id)

    expect(await wouldAutotagRssFeedItemCallOpenAI(itemId)).toBe(false)
  })

  it('returns false when the LLM topic budget is configured to zero', async () => {
    const { itemId } = await insertRssFeedItemFixture(testRssFeedId)

    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_discoverable_llm_max_topics: 0,
    })
    try {
      expect(await wouldAutotagRssFeedItemCallOpenAI(itemId)).toBe(false)
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
        rss_discoverable_llm_max_topics: 3,
      })
    }
  })

  it('returns false when the enabled kill-switch is off', async () => {
    const { itemId } = await insertRssFeedItemFixture(testRssFeedId)

    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: false })
    try {
      expect(await wouldAutotagRssFeedItemCallOpenAI(itemId)).toBe(false)
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: true })
    }
  })

  it('returns true for an eligible discoverable item with LLM budget', async () => {
    const { itemId } = await insertRssFeedItemFixture(testRssFeedId)

    expect(await wouldAutotagRssFeedItemCallOpenAI(itemId)).toBe(true)
  })
})
