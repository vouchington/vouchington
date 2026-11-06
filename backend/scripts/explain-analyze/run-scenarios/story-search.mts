import { seedHiddenFeedStorySearch } from '../seed-data/story-search-hidden-feeds.mts'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'

const { getPostIds } = services

const HIDDEN_STORY_COUNT = 200
const PAGE_LIMIT = 21
/** Hidden stories ranked above the page, the page, and its lookahead row, with join slack. */
const PROBE_MAX = (HIDDEN_STORY_COUNT + PAGE_LIMIT + 1) * 8
/**
 * Hot has no stable index. The custom plan stays on the type index (520.8
 * processed post rows in the 2026-11-06 explain run). The generic plan seq-scans
 * seeded posts and processed 113440.2 rows there.
 */
const HOT_POST_MAX = 120_000

export async function runStorySearchScenarios(): Promise<void> {
  await seedHiddenFeedStorySearch(seedUser.id)
  await captureStorySearch('story-search-new', 'new', PROBE_MAX)
  await captureStorySearch('story-search-best', 'best', PROBE_MAX)
  await captureStorySearch('story-search-hot', 'hot', HOT_POST_MAX)
}

async function captureStorySearch(
  scenario: string,
  sort: 'new' | 'best' | 'hot',
  postMax: number,
): Promise<void> {
  registerScenarioContract(scenario, {
    expectations: storySearchExpectations(postMax),
    crossPartition: {
      posts:
        'Story search ranks posts across the default time window, which can span id partitions.',
      rss_feed_items:
        'Each ranked story joins its source item, and those items can span id partitions.',
    },
  })
  await runAndCapture(scenario, () =>
    getPostIds(seedUser, { post_types: ['story'], sort, limit: PAGE_LIMIT }),
  )
}

function storySearchExpectations(postMax: number): PlanExpectation[] {
  return [
    { kind: 'maxProcessedRows', relation: 'posts', max: postMax },
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'stories', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'story_posts', max: PROBE_MAX },
  ]
}
