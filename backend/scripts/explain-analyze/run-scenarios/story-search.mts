import { seedHiddenFeedStorySearch } from '../seed-data/story-search-hidden-feeds.mts'
import {
  deleteStoryPostIndexPadding,
  seedStoryPostIndexPadding,
} from '../seed-data/story-post-index-padding.mts'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { getPostIds } from '../run-services.mts'
import { partitionIndexLeaves } from '../partition-index-leaves.mts'

const HIDDEN_STORY_COUNT = 200
const PAGE_LIMIT = 21
/** Hidden stories ranked above the page, the page, and its lookahead row, with join slack. */
const PROBE_MAX = (HIDDEN_STORY_COUNT + PAGE_LIMIT + 1) * 8
const STORY_HOT_INDEX = 'idx_posts__post_type__stable_hot_rank__id'

export async function runStorySearchScenarios(): Promise<void> {
  const storyHotLeaves = await partitionIndexLeaves(STORY_HOT_INDEX)
  await seedHiddenFeedStorySearch(seedUser.id)
  await seedStoryPostIndexPadding(seedUser.id)
  try {
    await captureStorySearch('story-search-new', 'new', storyHotLeaves)
    await captureStorySearch('story-search-best', 'best', storyHotLeaves)
    await captureStorySearch('story-search-hot', 'hot', storyHotLeaves)
  } finally {
    await deleteStoryPostIndexPadding()
  }
}

async function captureStorySearch(
  scenario: string,
  sort: 'new' | 'best' | 'hot',
  storyHotLeaves: readonly string[],
): Promise<void> {
  registerScenarioContract(scenario, {
    expectations: storySearchExpectations(sort, storyHotLeaves),
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

function storySearchExpectations(
  sort: 'new' | 'best' | 'hot',
  storyHotLeaves: readonly string[],
): PlanExpectation[] {
  const expectations: PlanExpectation[] = [
    { kind: 'maxProcessedRows', relation: 'posts', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'stories', max: PROBE_MAX },
    { kind: 'maxProcessedRows', relation: 'story_posts', max: PROBE_MAX },
  ]
  if (sort === 'hot') {
    expectations.push(
      { kind: 'noSeqScan', relation: 'posts' },
      { kind: 'usesIndexes', indexes: storyHotLeaves, anyOf: true },
    )
  }
  return expectations
}
