import { runRssUnmappedCategoryCapacityScenario } from './run-scenarios/rss-unmapped-category-capacity.mts'
import { runRssLatestCrawlCapacityScenario } from './run-scenarios/rss-latest-crawl-capacity.mts'
import { runRssHackerNewsFlagPagesCapacity } from './run-scenarios/rss-hacker-news-flag-pages-capacity.mts'
import { runRssFeedCollectionHydrationCapacity } from './run-scenarios/rss-feed-collection-hydration-capacity.mts'
import { runRssItemFeedHydrationCapacityScenario } from './run-scenarios/rss-item-feed-hydration-capacity.mts'
import { runRssStorySearchCapacityScenarios } from './run-scenarios/rss-story-search-capacity.mts'

export const CAPACITY_AUDIT_RUNNERS = [
  runRssUnmappedCategoryCapacityScenario,
  runRssLatestCrawlCapacityScenario,
  runRssHackerNewsFlagPagesCapacity,
  runRssFeedCollectionHydrationCapacity,
  runRssItemFeedHydrationCapacityScenario,
  runRssStorySearchCapacityScenarios,
] as const
