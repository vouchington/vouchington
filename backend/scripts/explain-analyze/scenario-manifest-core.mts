import { MODERATION_REPORT_DETAIL_SCENARIO_IDS } from './moderation-report-detail-scenario-ids.mts'
import { MEMBERSHIP_SCENARIO_IDS } from './membership-scenario-ids.mts'
import { VOTE_SCORE_SCENARIO_IDS } from './vote-score-scenario-ids.mts'
import { COMMENT_SCENARIO_IDS } from './comment-scenario-ids.mts'
import { INGESTION_PAGE_SCENARIO_IDS } from './ingestion-page-scenario-ids.mts'
import { RELATION_SCENARIOS } from './relation-scenarios.mts'
import { VIEW_DRIVEN_SCENARIO_IDS } from './view-driven-scenario-ids.mts'
import { USER_PROFILE_SCENARIO_IDS } from './user-profile-scenario-ids.mts'
import { RELATION_READ_BATCH_SCENARIO_IDS } from './relation-read-batch-scenario-ids.mts'
import { BOUNDED_WORK_SCENARIOS } from './scenario-manifest-work.mts'
import { SHARED_LOADER_SCENARIO_IDS } from './shared-loader-scenario-ids.mts'

export const CORE_SCENARIOS = [
  ...MODERATION_REPORT_DETAIL_SCENARIO_IDS,
  'mcp-admission-user',
  ...VOTE_SCORE_SCENARIO_IDS,
  ...VIEW_DRIVEN_SCENARIO_IDS,
  ...BOUNDED_WORK_SCENARIOS,
  'url-blocklist-hostnames',
  'hostname-cache-invalidation-claim',
  ...(['mv-top-hashtags-refresh', 'mv-rss-feed-crawl-tiers-refresh'] as const),
  ...(['mv-platform-stats-refresh', 'mv-trending-rss-feeds-refresh'] as const),
  ...(['mv-trending-communities-refresh', 'mv-revenue-changes-refresh'] as const),
  'mv-revenue-memberships-refresh',
  'mv-trending-topics-refresh',
  ...INGESTION_PAGE_SCENARIO_IDS,
  'post-search-similar-post-new',
  'post-search-similar-post-relevance',
  'post-search-similar-rss-new',
  'post-search-similar-rss-relevance',
  ...(['post-search-semantic-new', 'post-search-semantic-relevance'] as const),
  ...(['post-search-semantic-new-1m', 'post-search-hybrid-new'] as const),
  'post-search-semantic-hot',
  'post-search-hybrid-relevance',
  'classifier-human-vote-comparison-classifier',
  'classifier-human-vote-comparison-community',
  'classifier-human-vote-comparison-post',
  'classifier-human-vote-comparison-rss-feed-item',
  ...COMMENT_SCENARIO_IDS,
  'conversation-messages',
  'direct-message-inbox-page',
  'community-activity-digest-aggregation',
  'community-activity-digest-recipients',
  'conversations-by-user',
  'crawl-chunks-by-crawl',
  'crawl-latest-successful',
  ...RELATION_SCENARIOS,
  'first-community-post-id-index',
  'feed-posts-batch',
  'rss-public-post-snapshots-first',
  'rss-public-post-snapshots-continuation',
  'rss-public-post-snapshots-absent',
  'feed-shared-by-users-batch',
  'follow-context-votes',
  ...RELATION_READ_BATCH_SCENARIO_IDS,
  'relatable-post-access-batch',
  'friend-recommendations',
  'friend-trusted-hostnames',
  'individual-cards-page',
  ...USER_PROFILE_SCENARIO_IDS,
  ...SHARED_LOADER_SCENARIO_IDS,
  ...MEMBERSHIP_SCENARIO_IDS,
  'point-valuations-page',
  'spending-categories-page',
  'rewards-program-statuses-page',
  'modmail-inbox-page',
  ...(['notifications', 'notifications-unread-summary'] as const),
  'oauth-client-verification-verified-page',
  'platform-stats',
  ...(['revenue-global', 'revenue-scoped'] as const),
] as const
