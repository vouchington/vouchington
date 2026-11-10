import { DISPATCH_AND_CRAWL_SCENARIO_IDS } from './dispatch-and-crawl-scenario-ids.mts'
import { HACKER_NEWS_SCALE_SCENARIO_IDS } from './hacker-news-scale-scenario-ids.mts'
import { HACKER_NEWS_WORK_SCENARIO_IDS } from './hacker-news-work-scenario-ids.mts'
import { COPYRIGHT_CASE_PURGE_SCENARIO_IDS } from './copyright-case-purge-scenario-ids.mts'
import { COPYRIGHT_DELIVERY_SCENARIO_IDS } from './copyright-delivery-scenario-ids.mts'
import { PUBLICATION_SCOPE_SCENARIO_IDS } from './publication-scope-scenario-ids.mts'
import { NOTIFICATION_VISIBILITY_SCENARIO_IDS } from './notification-visibility-scenario-ids.mts'
import { POST_URL_CAPACITY_SCENARIOS } from './post-related-url-capacity-scenario-ids.mts'
import { CRITICAL_ALERT_SCENARIO_IDS } from './critical-alert-scenario-ids.mts'
import { BLUESKY_FOLLOWER_SCENARIO_IDS } from './bluesky-follower-scenario-ids.mts'

export const MAINTENANCE_WORK_SCENARIOS = [
  'topic-alias-category-dirty-page',
  'topic-alias-raw-rss_item_categories',
  'topic-alias-raw-rss_item_text_categories',
  'topic-alias-raw-rss_feed_text_categories',
  'topic-alias-feed-category-fan-in',
  'topic-alias-item-category-fan-in',
  'topic-alias-unlinked-category-fan-in',
  'import-retention-parent',
  'user-import-approval-first-page',
  'user-import-approval-continuation',
  'user-import-approval-first-page-vacuumed',
  'user-import-approval-continuation-vacuumed',
  'import-retention-child-continuation',
  'request-attempt-retention-continuation',
  'request-attempt-retention-delete',
  ...HACKER_NEWS_SCALE_SCENARIO_IDS,
  ...HACKER_NEWS_WORK_SCENARIO_IDS,
  'request-range-retirement-recent',
  ...COPYRIGHT_DELIVERY_SCENARIO_IDS,
  ...COPYRIGHT_CASE_PURGE_SCENARIO_IDS,
  'upload-cleanup-staged-upper',
  'upload-cleanup-staged-first',
  'upload-cleanup-staged-forward',
  'upload-cleanup-recovery-upper',
  'upload-cleanup-recovery-first',
  'upload-cleanup-recovery-forward',
  'upload-cleanup-abandonment-upper',
  'upload-cleanup-abandonment-first',
  'upload-cleanup-abandonment-forward',
  ...PUBLICATION_SCOPE_SCENARIO_IDS,
  ...NOTIFICATION_VISIBILITY_SCENARIO_IDS,
  ...POST_URL_CAPACITY_SCENARIOS,
  'sitemap-users-page',
  'sitemap-topics-page',
  'sitemap-landing-pages-page',
  'sitemap-post-day-page',
  'deleted-parent-community-members',
  'deleted-parent-member-communities',
  'deleted-parent-followed-feeds',
  'deleted-parent-saved-items',
  'deleted-parent-source-feeds',
  'deleted-parent-selected-recipients',
  'deleted-parent-moderation-versions',
  'search-community-members-owner-role',
  'search-community-members-moderator-role',
  'search-community-members-moderator-roster',
  'search-pending-posts-dense-approved',
  'landing-page-candidates-among-other-posts',
  'user-removed-community-posts-page',
  ...DISPATCH_AND_CRAWL_SCENARIO_IDS,
  ...CRITICAL_ALERT_SCENARIO_IDS,
  ...BLUESKY_FOLLOWER_SCENARIO_IDS,
] as const
