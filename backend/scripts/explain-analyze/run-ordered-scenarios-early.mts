import { INGESTION_CRAWL_RUNNERS } from './run-ordered-scenarios-ingestion-crawl.mts'
import { FEEDS_FOLLOWS_RUNNERS } from './run-ordered-scenarios-feeds-follows.mts'
import { SEARCH_ENTITIES_RUNNERS } from './run-ordered-scenarios-search-entities.mts'
import { IMPORTS_RETENTION_RUNNERS } from './run-ordered-scenarios-imports-retention.mts'
import { MODERATION_RUNNERS } from './run-ordered-scenarios-moderation.mts'
import { READ_PATHS_RUNNERS } from './run-ordered-scenarios-read-paths.mts'
import { STORY_ENGAGEMENT_RUNNERS } from './run-ordered-scenarios-story-engagement.mts'

export const EARLY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  ...INGESTION_CRAWL_RUNNERS,
  ...FEEDS_FOLLOWS_RUNNERS,
  ...SEARCH_ENTITIES_RUNNERS,
  ...IMPORTS_RETENTION_RUNNERS,
  ...MODERATION_RUNNERS,
  ...READ_PATHS_RUNNERS,
  ...STORY_ENGAGEMENT_RUNNERS,
]
