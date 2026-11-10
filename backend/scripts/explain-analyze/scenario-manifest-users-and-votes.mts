import { VOTE_WEIGHT_DISPATCH_SCENARIO_IDS } from './vote-weight-dispatch-scenario-ids.mts'
import { ROUND_TRIP_SHAPE_SCENARIO_IDS } from './round-trip-shape-scenario-ids.mts'
import { SESSION_LIMIT_SCENARIO_IDS } from './session-limit-scenario-ids.mts'

export const USERS_AND_VOTES_SCENARIOS = [
  'url-hostname-search-by-topic',
  ...(['url-search', 'url-search-hostname', 'url-search-text'] as const),
  'user-bookmark-counts',
  ...SESSION_LIMIT_SCENARIO_IDS,
  'user-by-username',
  ...(['user-profile-metrics', 'profile-post-type-counts'] as const),
  'user-removed-posts-page',
  ...(['vote-aggregation-post', 'vote-aggregation-topic'] as const),
  ...(['vote-weight-factors', ...VOTE_WEIGHT_DISPATCH_SCENARIO_IDS] as const),
  'follower-distribution-rate-limit-post_share',
  'follower-distribution-rate-limit-post_send',
  'follower-distribution-rate-limit-rss_feed_item_share',
  'follower-distribution-rate-limit-rss_feed_item_send',
  'follower-distribution-selected-recipients',
  'post-creation-moderation-bypass',
  'spam-content-hash-duplicate',
  'spam-embeddings-similarity',
  'media-delivery-replay-first',
  'media-delivery-replay-continuation',
  'media-delivery-replay-scoped',
  ...ROUND_TRIP_SHAPE_SCENARIO_IDS,
] as const
