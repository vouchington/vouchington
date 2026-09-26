import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  addCategoryToRssFeedItem,
  addDummyEmbeddingToRssFeedItem,
  createTestMembership,
  createTestTopic,
  createTestUser,
  followTopicById,
  getRssFeedItemCategoryTopicRelationDeletedAt,
  insertEntityRelation,
  insertTestRssFeedItem,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { setTestRssFeedDiscoverable } from '@voucha/test-helpers/entities/rss-feeds-discovery'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { addUrl } from '@services/urls/upsert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { isRssFeedItemFromDiscoverableSource } from '@services/rss-feed-items/discoverability'
import { autotaggerPaidLimitsConfig } from '@services/autotagger'
import {
  StructuredDecisionError,
  type createStructuredDecisionClient,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'
import { runAutotaggerOnRssFeedItem } from './run-rss-feed-item.mts'

// Kill-switch, discoverability gating, tiered max_topics, and the collaborative-topic pass are
// this file's whole job -- see process-autotagger.part-2.test.mts's header, which mocks
// runAutotaggerOnRssFeedItem entirely and defers this behavior here. The collaborative pass's own
// selection/ranking logic (plus/pro pools, aliasing, soft-delete exclusion) is owned by
// collaborative-topic-relations.test.mts; this file only proves gating and pass ordering, reusing
// that file's fixture shape (a single paid follower following a single topic is enough signal).
//
// Every "classifier skipped" case also feed-maps a real candidate topic first: without that,
// dispatch would never be attempted anyway (zero candidates), and the gate under test would not
// be exercised at all.

async function setupItem(discoverable: boolean): Promise<{ feedId: string; itemId: string }> {
  // createTestRssFeed's real create path seeds both enablement and discoverability to TRUE
  // synchronously (createInitialRssFeedStateChanges) -- insertTestRssFeedDirect does too (its
  // underlying insertTestRssFeedWithUrlId inserts the same "initial state" rows), so there is no
  // raw-insert fixture that starts non-discoverable. Flip it off explicitly instead.
  const feed = await createTestRssFeed({})
  if (!discoverable) await setTestRssFeedDiscoverable(feed.id, false)
  const urlEntry = await addUrl(null, `https://run-rss-item-${randomUUID()}.example.com/item`)
  const guid = `run-rss-item-${randomUUID()}`
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: urlEntry!.id,
    guid,
    itemData: { link: 'https://example.com', guid, title: `Run RSS item ${randomUUID()}` },
    contentSha256: Buffer.alloc(32),
  })
  return { feedId: feed.id, itemId }
}

async function addPaidFollowerFollowingTopic(feedId: string, topicId: string): Promise<void> {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)
  await followTopicById(user.id, topicId)
}

// The item<->topic relation write inside applyCollaborativeTopicRelations is awaited directly
// (only its vote-stats recompute is fire-and-forget), so this is deterministic: undefined means no
// relation row exists at all (the pass never ran), null means one exists and is not soft-deleted.
async function expectCollaborativeRelationApplied(
  itemId: string,
  topicId: string,
  applied: boolean,
): Promise<void> {
  const deletedAt = await getRssFeedItemCategoryTopicRelationDeletedAt(itemId, topicId)
  expect(deletedAt).toBe(applied ? null : undefined)
}

async function addMatchingTopicEmbedding(topicId: string, embedding: number[]): Promise<void> {
  const inputSha256 = createHash('sha256').update(topicId).digest()
  await updateTopicEmbeddingData({ topicId, inputSha256, embedding, tokens: 10 })
}

describe('runAutotaggerOnRssFeedItem', () => {
  it('returns null and skips both passes when the enabled kill switch is off', async () => {
    const { feedId, itemId } = await setupItem(true)
    const collaborativeTopic = await createTestTopic({})
    await addPaidFollowerFollowingTopic(feedId, collaborativeTopic.id)
    const candidateTopic = await createTestTopic({})
    await addCategoryToRssFeedItem(itemId, candidateTopic.id)
    const item = (await getRssFeedItemById(itemId))!
    const fake = createFakeStructuredDecisionClient()

    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      enabled: false,
    })
    try {
      const result = await runAutotaggerOnRssFeedItem(item, { createClient: fake.createClient })
      expect(result).toBeNull()
      expect(fake.decide).not.toHaveBeenCalled()
      await expectCollaborativeRelationApplied(itemId, collaborativeTopic.id, false)
    } finally {
      restore()
    }
  })

  it('applies the collaborative pass but skips the classifier for a non-discoverable item', async () => {
    const { feedId, itemId } = await setupItem(false)
    expect(await isRssFeedItemFromDiscoverableSource(itemId)).toBe(false)
    const collaborativeTopic = await createTestTopic({})
    await addPaidFollowerFollowingTopic(feedId, collaborativeTopic.id)
    const candidateTopic = await createTestTopic({})
    await addCategoryToRssFeedItem(itemId, candidateTopic.id)
    const item = (await getRssFeedItemById(itemId))!
    const fake = createFakeStructuredDecisionClient()

    const result = await runAutotaggerOnRssFeedItem(item, { createClient: fake.createClient })

    expect(result).toBeNull()
    expect(fake.decide).not.toHaveBeenCalled()
    await expectCollaborativeRelationApplied(itemId, collaborativeTopic.id, true)
  })

  it('skips the classifier but still applies the collaborative pass when the discoverable tier budget is zero', async () => {
    const { feedId, itemId } = await setupItem(true)
    const collaborativeTopic = await createTestTopic({})
    await addPaidFollowerFollowingTopic(feedId, collaborativeTopic.id)
    const candidateTopic = await createTestTopic({})
    await addCategoryToRssFeedItem(itemId, candidateTopic.id)

    // searchTopicsByRssFeedItemEmbedding clamps its limit up to 1 internally
    // (by-rss-feed-item-embedding.mts's safeLimit), so without this file's own
    // `rss_discoverable_llm_max_topics === 0` early return, this real, embedding-matching candidate
    // would still be found and dispatched even though the feed-mapped search (a plain SQL LIMIT 0)
    // legitimately returns nothing on its own.
    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(itemId, { embedding })
    const embeddingMatchTopic = await createTestTopic({})
    await addMatchingTopicEmbedding(embeddingMatchTopic.id, makeNearbyEmbedding(embedding, 0.01))

    const item = (await getRssFeedItemById(itemId))!
    const fake = createFakeStructuredDecisionClient()

    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_discoverable_llm_max_topics: 0,
    })
    try {
      const result = await runAutotaggerOnRssFeedItem(item, { createClient: fake.createClient })
      expect(result).toBeNull()
      expect(fake.decide).not.toHaveBeenCalled()
      await expectCollaborativeRelationApplied(itemId, collaborativeTopic.id, true)
    } finally {
      restore()
    }
  })

  it('still applies the collaborative pass when classifier dispatch rejects', async () => {
    const { feedId, itemId } = await setupItem(true)
    const collaborativeTopic = await createTestTopic({})
    await addPaidFollowerFollowingTopic(feedId, collaborativeTopic.id)
    const candidateTopic = await createTestTopic({})
    await addCategoryToRssFeedItem(itemId, candidateTopic.id)
    const item = (await getRssFeedItemById(itemId))!

    const throwingDecide = vi.fn<StructuredDecisionClient['decide']>(async () => {
      throw new StructuredDecisionError('provider-error', 'simulated provider outage')
    })
    const throwingCreateClient = vi.fn<typeof createStructuredDecisionClient>(() => ({
      decide: throwingDecide,
    }))

    await expect(
      runAutotaggerOnRssFeedItem(item, { createClient: throwingCreateClient }),
    ).rejects.toThrow(StructuredDecisionError)
    // The collaborative pass runs first and unconditionally, independent of the classifier's own
    // outcome -- this is the invariant run-rss-feed-item.mts's docstring gives for pass ordering.
    await expectCollaborativeRelationApplied(itemId, collaborativeTopic.id, true)
  })

  it('dispatches only the feed-mapped topics first when they already fill the tier cap', async () => {
    const { itemId } = await setupItem(true)
    const mappedFirst = await createTestTopic({})
    const mappedSecond = await createTestTopic({})
    // Distinct category texts: rss_feed_item_categories' primary key is
    // (rss_feed_item_id, category_text), so reusing the helper's default text for a second
    // category on the same item would silently no-op the second insert (ON CONFLICT DO NOTHING).
    await addCategoryToRssFeedItem(itemId, mappedFirst.id, 'mapped-first')
    await addCategoryToRssFeedItem(itemId, mappedSecond.id, 'mapped-second')

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(itemId, { embedding })
    const embeddingOnly = await createTestTopic({})
    await addMatchingTopicEmbedding(embeddingOnly.id, makeNearbyEmbedding(embedding, 0.01))

    const item = (await getRssFeedItemById(itemId))!
    const fake = createFakeStructuredDecisionClient()

    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_discoverable_llm_max_topics: 2,
    })
    try {
      await runAutotaggerOnRssFeedItem(item, { createClient: fake.createClient })

      expect(fake.decide).toHaveBeenCalledTimes(1)
      const request = fake.decide.mock.calls[0]![0]
      const dispatchedIds = request.questions.map(question => question.id)
      expect(new Set(dispatchedIds)).toEqual(new Set([mappedFirst.id, mappedSecond.id]))
      expect(dispatchedIds).not.toContain(embeddingOnly.id)
    } finally {
      restore()
    }
  })

  it('deduplicates a topic that is both feed-mapped and embedding-similar', async () => {
    const { itemId } = await setupItem(true)
    const both = await createTestTopic({})
    await addCategoryToRssFeedItem(itemId, both.id)

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(itemId, { embedding })
    await addMatchingTopicEmbedding(both.id, makeNearbyEmbedding(embedding, 0.01))
    const embeddingOnly = await createTestTopic({})
    await addMatchingTopicEmbedding(embeddingOnly.id, makeNearbyEmbedding(embedding, 0.01))

    const item = (await getRssFeedItemById(itemId))!
    const fake = createFakeStructuredDecisionClient()

    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_discoverable_llm_max_topics: 3,
    })
    try {
      await runAutotaggerOnRssFeedItem(item, { createClient: fake.createClient })

      expect(fake.decide).toHaveBeenCalledTimes(1)
      const request = fake.decide.mock.calls[0]![0]
      const dispatchedIds = request.questions.map(question => question.id)
      expect(dispatchedIds).toHaveLength(2)
      expect(new Set(dispatchedIds)).toEqual(new Set([both.id, embeddingOnly.id]))
    } finally {
      restore()
    }
  })
})
