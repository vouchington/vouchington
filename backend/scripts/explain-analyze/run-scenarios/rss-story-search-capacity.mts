import assert from 'node:assert/strict'
import { getStoryMemberPagesBatch } from '@services/feeds/rss-feed-items/story-member-pages'
import { searchRssFeedItemsBySemantic } from '@services/rss-feed-items/search-semantic'
import { getStoryPreviews } from '@services/stories/story-previews'
import { getStoryRelatedItemsConfig } from '@services/stories/story-related-items-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  RSS_STORY_SEARCH_PAGE_SIZE,
  SEMANTIC_QUERY_VECTOR,
  STORY_MEMBER_COUNT,
  seedRssStorySearchCapacity,
  removeRssStorySearchItems,
} from '../seed-data/rss-story-search-capacity.mts'

type Fixture = Awaited<ReturnType<typeof seedRssStorySearchCapacity>>

export async function runRssStorySearchCapacityScenarios(): Promise<void> {
  const fixture = await seedRssStorySearchCapacity()
  try {
    await captureStoryPreviewBatch(fixture)
    await captureSemanticSearch(fixture)
  } finally {
    await removeRssStorySearchItems(fixture)
  }
}

async function captureStoryPreviewBatch(fixture: Fixture): Promise<void> {
  const scenario = 'rss-story-preview-feed-batch-at-cap'
  const { preview_limit: limit } = getStoryRelatedItemsConfig()
  const storyIds = fixture.storyIds.slice(0, RSS_STORY_SEARCH_PAGE_SIZE)
  const requests = storyIds.map(storyId => {
    const members = fixture.membersByStory.get(storyId)!
    assert.equal(members.length, STORY_MEMBER_COUNT)
    return { story_id: storyId, id: members[0]!, delivery_type: 'direct' as const }
  })
  registerScenarioContract(scenario, {
    crossPartition: { rss_feed_items: 'Story members can span multiple item UUID partitions.' },
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_items',
        max: storyIds.length * STORY_MEMBER_COUNT,
        captureIndex: 0,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_items',
        max: storyIds.length * (STORY_MEMBER_COUNT - 1 - limit),
        captureIndex: 1,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_sources',
        max: storyIds.length * (limit + 1),
        captureIndex: 0,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_sources',
        max: storyIds.length * (STORY_MEMBER_COUNT - 1 - limit),
        captureIndex: 1,
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const previews = await getStoryPreviews(seedUser, requests)
      assert.deepEqual(Object.keys(previews).toSorted(), storyIds.toSorted())
      const continuations = requests.map(request => {
        const page = previews[request.story_id]!
        const members = fixture.membersByStory.get(request.story_id)!
        assert.deepEqual(page.item_ids, members.slice(1, 1 + limit))
        assert.equal(page.page_info.has_next_page, true)
        assert.ok(page.page_info.end_cursor)
        return {
          story_id: request.story_id,
          exclude_item_id: request.id,
          after: page.page_info.end_cursor,
        }
      })
      const last = await getStoryMemberPagesBatch(seedUser, continuations, { limit })
      assert.deepEqual(Object.keys(last).toSorted(), storyIds.toSorted())
      for (const storyId of storyIds) {
        const page = last[storyId]!
        assert.deepEqual(page.item_ids, fixture.membersByStory.get(storyId)!.slice(1 + limit))
        assert.equal(page.page_info.has_next_page, false)
        assert.equal(page.page_info.end_cursor, null)
      }
    },
    undefined,
    'getStoryMemberPagesBatch',
  )
}

async function captureSemanticSearch(fixture: Fixture): Promise<void> {
  const scenario = 'rss-semantic-search-at-cap'
  const options = {
    semantic_search_query: 'RSS capacity search vector',
    limit: RSS_STORY_SEARCH_PAGE_SIZE,
    rss_feed_ids: [fixture.feedId],
    currentUserId: seedUser.id,
    dependencies: { getCachedSearchEmbedding: async () => SEMANTIC_QUERY_VECTOR },
  }
  const expected = [...fixture.membersByStory.values()]
    .map(members => members[0]!)
    .toSorted()
    .toReversed()
  registerScenarioContract(scenario, {
    crossPartition: {
      rss_feed_items: 'Semantic RSS search ranks matching items across item UUID partitions.',
    },
    seededRows: { rss_feeds: fixture.feedCount },
    expectations: [
      // Exact story ranking still compares the candidates before applying the cursor.
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: fixture.itemIds.length },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await searchRssFeedItemsBySemantic(options)
      assert.deepEqual(
        first.results.map(item => item.id),
        expected.slice(0, RSS_STORY_SEARCH_PAGE_SIZE),
      )
      assert.equal(first.page_info.has_next_page, true)
      assert.ok(first.page_info.end_cursor)
      const last = await searchRssFeedItemsBySemantic({
        ...options,
        after: first.page_info.end_cursor,
      })
      assert.deepEqual(
        last.results.map(item => item.id),
        expected.slice(RSS_STORY_SEARCH_PAGE_SIZE),
      )
      assert.equal(last.page_info.has_next_page, false)
      assert.equal(last.page_info.end_cursor, null)
    },
    undefined,
    'searchRssFeedItemsBySemantic',
  )
}
