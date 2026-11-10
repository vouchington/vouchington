import { CORE_SCENARIOS } from './scenario-manifest-core.mts'
import { POSTS_AND_FEEDS_SCENARIOS } from './scenario-manifest-posts-and-feeds.mts'
import { SEARCH_AND_TOPICS_SCENARIOS } from './scenario-manifest-search-and-topics.mts'
import { USERS_AND_VOTES_SCENARIOS } from './scenario-manifest-users-and-votes.mts'

export const EXPLAIN_SCENARIO_MANIFEST = [
  ...CORE_SCENARIOS,
  ...POSTS_AND_FEEDS_SCENARIOS,
  ...SEARCH_AND_TOPICS_SCENARIOS,
  ...USERS_AND_VOTES_SCENARIOS,
] as const
