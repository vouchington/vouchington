import { CORE_SCENARIOS } from './scenario-manifest-core.mts'
import { POSTS_AND_FEEDS_SCENARIOS } from './scenario-manifest-posts-and-feeds.mts'
import { SEARCH_AND_TOPICS_SCENARIOS } from './scenario-manifest-search-and-topics.mts'
import { USERS_AND_VOTES_SCENARIOS } from './scenario-manifest-users-and-votes.mts'

export const EXPLAIN_SCENARIO_MANIFEST = [
  ...CORE_SCENARIOS,
  ...POSTS_AND_FEEDS_SCENARIOS,
  ...SEARCH_AND_TOPICS_SCENARIOS,
  ...USERS_AND_VOTES_SCENARIOS,
  'conversation-messages-at-cap',
  'notifications-inbox-at-cap',
  'notifications-mark-all-read-at-cap',
  'related-posts-by-url-at-cap',
  'rss-ingest-content-at-cap',
  'rss-hard-delete-sources-at-cap',
  'account-email-addresses-at-cap',
  'account-api-keys-at-cap',
  'account-oauth-apps-at-cap',
  'account-oauth-grants-at-cap',
] as const
