import { SEMANTIC_POST_SEARCH_SETTINGS } from '@services/posts/search/execute-query'
import { searchStorySourcePosts } from '@services/posts/search/story-source-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'

const { getPostIds } = services

export async function runStorySourceSearchScenarios(): Promise<void> {
  await captureStorySourceScenario('story-source-search-new', 'new')
  await captureStorySourceScenario('story-source-search-best', 'best')
  await captureStorySourceScenario('story-source-search-hot', 'hot')
  await captureStorySourceScenario('story-source-search-following', 'following_new')
  registerScenarioContract('story-source-search-text', storySourcePlanContract())
  await runAndCapture('story-source-search-text', () =>
    getPostIds(seedUser, {
      post_types: ['story'],
      text_search_query: 'seed',
      limit: 21,
      time_range: 'all',
    }),
  )
  registerScenarioContract('story-source-search-semantic', storySourcePlanContract())
  await runAndCapture(
    'story-source-search-semantic',
    () =>
      searchStorySourcePosts(seedUser, {
        post_types: ['story'],
        semantic_search_query: 'seed',
        semanticSearchEmbedding: [1, ...Array<number>(1023).fill(0)],
        limit: 21,
        time_range: 'all',
      }),
    undefined,
    'listStorySourcePage',
    { localSettings: SEMANTIC_POST_SEARCH_SETTINGS },
  )
}

async function captureStorySourceScenario(
  scenario: string,
  sort: 'new' | 'best' | 'hot' | 'following_new',
): Promise<void> {
  registerScenarioContract(scenario, storySourcePlanContract())
  await runAndCapture(scenario, () =>
    getPostIds(seedUser, { post_types: ['story'], sort, limit: 21, time_range: 'all' }),
  )
}

function storySourcePlanContract() {
  return {
    expectations: [
      { kind: 'maxProcessedRows' as const, relation: 'rss_feeds', max: 40 },
      { kind: 'maxProcessedRows' as const, relation: 'rss_feed_item_sources', max: 400 },
      { kind: 'maxProcessedRows' as const, relation: 'rss_feed_items', max: 400 },
      { kind: 'maxProcessedRows' as const, relation: 'posts', max: 800 },
      { kind: 'maxProcessedRows' as const, relation: 'stories', max: 400 },
      { kind: 'maxProcessedRows' as const, relation: 'story_posts', max: 400 },
      { kind: 'maxProcessedRows' as const, relation: 'communities', max: 200 },
      {
        kind: 'usesIndexes' as const,
        indexes: [
          'idx_rss_feeds__enabled__discoverable',
          'idx_rss_feed_item_sources__feed_published_item',
          'idx_rss_feed_item_sources__missing_published_at',
        ],
      },
    ],
    crossPartition: {
      posts:
        'A story source page joins the inspected items to posts that can sit in more than one id partition.',
      rss_feed_items:
        'A story source page joins inspected items that can sit in more than one id partition.',
    },
  }
}
