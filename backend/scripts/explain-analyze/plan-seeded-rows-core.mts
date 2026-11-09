import { VOTE_SEEDED_ROWS } from './post-vote-state-scenario-ids.mts'
import * as rss from './seed-data/rss-feed-weekly-proxy.mts'
import * as prompt from './community-agent-prompt-page-ids.mts'
import { LANDING_PAGE_REVIEW_COUNT } from './seed-data/landing-page-candidates.mts'
import { FOLLOWER_DISTRIBUTION_SEED_COUNT } from './seed-data/common.mts'
import * as ingestion from './seed-data/ingestion-raw-pages.mts'
import * as retention from './seed-data/agent-moderation-retention.mts'
import * as friendTrust from './seed-data/friend-trusted-hostnames.mts'
import { ANCILLARY_SEED_ROW_UPPER_BOUND } from './plan-ancillary-seeded-rows.mts'

export const CORE_SEEDED_ROWS_BY_RELATION: Readonly<Record<string, number>> = {
  url_hostname_cache_invalidation_work_items: 20_000,
  users:
    20_005 + prompt.COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + prompt.COMMUNITY_AGENT_PROMPT_CREATOR_COUNT,
  follower_distributions: FOLLOWER_DISTRIBUTION_SEED_COUNT,
  follower_distribution_deliveries: FOLLOWER_DISTRIBUTION_SEED_COUNT,
  user_email_addresses: 40_000,
  oauth_clients: 26_000,
  topics: 3_603 + rss.RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT,
  individual_cards: 10_000,
  individual_rewards_program_point_valuations: 10_000,
  spending_entries: 20_000,
  individual_rewards_program_statuses: 10_000,
  posts: 102_021 + LANDING_PAGE_REVIEW_COUNT,
  agent_moderations: retention.AGENT_MODERATION_RETENTION_ROWS,
  moderation_transparency_released_daily_rollups:
    retention.AGENT_MODERATION_RETENTION_RELEASED_NOISE + ANCILLARY_SEED_ROW_UPPER_BOUND,
  post_feed_shares: 4_064,
  user_topic_import_attempts: 25_001,
  url_hostnames: 4_018, // Existing 2000 hosts, 11 policy flags, 2006 crawl-sweep hosts and one referral benchmark host.
  url_hostname_blocks: 6,
  urls: 10_000,
  rss_feeds: 2_500,
  rss_feed_items: 35_001, // 25k base + 10k weekly items + one eight-day witness.
  rss_feed_item_guids: 35_001,
  rss_feed_item_sources: 75_001,
  rss_feed_item_categories: 15_001,
  rss_category_identities: 201, // 200 category values plus seedTopHashtags' seedhashtag.
  relation__user__follow__user: 11_000 + friendTrust.FRIEND_TRUST_FOLLOW_COUNT,
  relation__user__mute__user: 2_500,
  relation__user__block__user: 2_500,
  remote_actors: 100_000,
  relation__remote_actor__follow__user: 101_000,
  relation__user__follow__rss_feed: 2_699,
  relation__user__follow__topic: 2_699,
  notifications: 2_000,
  conversations: 2_001,
  conversation_messages: 500,
  ...VOTE_SEEDED_ROWS,
  crawls: 500,
  crawl_chunks: 1_500,
  topic_aliases: 2_757,
  user_profile_links: 3_000,
  community_post_reviews: 2_050,
  community_agent_prompts: prompt.COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + 4,
  agent_prompts: prompt.COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + 4,
  user_lists: 3,
  user_list_posts: 1_080,
  oauth_authorizations: 3,
  communities: 21_261 + 1 + prompt.COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES,
  community_search_counts: 21_261,
  community_list_topics: 1 + rss.RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT,
  community_members:
    13_199 +
    prompt.COMMUNITY_AGENT_PROMPT_CREATOR_COUNT +
    prompt.COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES,
  facebook_accounts: ingestion.INGESTION_ACCOUNT_ROW_COUNT + 2,
  x_accounts: ingestion.INGESTION_ACCOUNT_ROW_COUNT,
  github_accounts: ingestion.INGESTION_ACCOUNT_ROW_COUNT,
  bedrock_embedding_batches: ingestion.INGESTION_BEDROCK_ROW_COUNT,
  facebook_friends: 1,
}
