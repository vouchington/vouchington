import {
  hackerNewsWorkConfig,
  hackerNewsWorkMaxValues,
} from '@services/urls/hacker-news-work-limits'
import {
  moderationAnalyticsWorkConfig,
  moderationAnalyticsWorkMaxValues,
} from '@services/moderation-analytics/work-limits'
import { usersWorkConfig, usersWorkMaxValues } from '@services/users/work-limits'
import {
  postClearanceWorkConfig,
  postClearanceWorkMaxValues,
} from '@services/post-clearance/work-limits'
import { voteWeightWorkConfig, voteWeightWorkMaxValues } from '@services/vote-weight/work-limits'
import {
  crawlBoilerplateRemovalWorkConfig,
  crawlBoilerplateRemovalWorkMaxValues,
} from '@queues/crawl-dispatch/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  findYourFriendsWorkConfig,
  findYourFriendsWorkMaxValues,
} from '@queues/find-your-friends/config'
import { articlesWorkConfig, articlesWorkMaxValues } from '@services/articles/work-limits'
import {
  prioritizedReferralLinksWorkConfig,
  prioritizedReferralLinksWorkMaxValues,
} from '@services/prioritized-referral-links/work-limits'
import {
  MIN_RETIRED_GENERATION_GRACE_SECONDS,
  sitemapsWorkConfig,
  sitemapsWorkMaxValues,
} from '@services/sitemaps/work-limits'

export const backgroundWorkRegistryEntries9 = {
  'hacker-news-work-config': defineBoundedWorkNamespace({
    namespace: 'hacker-news-work-config',
    config: hackerNewsWorkConfig,
    label: 'Hacker News references',
    maxValues: hackerNewsWorkMaxValues,
    descriptions: {
      lookup_batch_size: 'URL identities resolved per lookup admission statement.',
      recent_age_days: 'URL age below which the recent refresh interval applies.',
      middle_age_days: 'URL age below which the middle refresh interval applies.',
      recent_refresh_hours: 'Interval between lookups for the newest URLs.',
      middle_refresh_hours: 'Interval between lookups for URLs past the recent age window.',
      older_refresh_hours: 'Interval between lookups for older URLs within retention.',
      hits_per_page: 'Hits requested from each Hacker News search page.',
      write_batch_size: 'Canonical URLs refreshed in one database transaction.',
      request_timeout_ms: 'Maximum time for one search request.',
      retention_days: 'Days since the last successful lookup before reference facts expire.',
      retention_batch_size: 'Expired URL snapshots removed in one retention transaction.',
      retention_max_batches: 'Maximum retention transactions per scheduled run.',
    },
  }),
  'articles-work-config': defineBoundedWorkNamespace({
    namespace: 'articles-work-config',
    config: articlesWorkConfig,
    label: 'Articles',
    maxValues: articlesWorkMaxValues,
    descriptions: { sync_batch_size: 'Markdown files loaded and processed per sync batch.' },
  }),
  'moderation-analytics-work-config': defineBoundedWorkNamespace({
    namespace: 'moderation-analytics-work-config',
    config: moderationAnalyticsWorkConfig,
    label: 'Moderation analytics',
    maxValues: moderationAnalyticsWorkMaxValues,
    descriptions: { leaderboard_page_size: 'Moderators included in the activity leaderboard.' },
  }),
  'users-work-config': defineBoundedWorkNamespace({
    namespace: 'users-work-config',
    config: usersWorkConfig,
    label: 'Users',
    maxValues: usersWorkMaxValues,
    descriptions: {
      engagement_claim_hours: 'Engagement claim hours for background processing.',
    },
  }),
  'post-clearance-work-config': defineBoundedWorkNamespace({
    namespace: 'post-clearance-work-config',
    config: postClearanceWorkConfig,
    label: 'Post clearance',
    maxValues: postClearanceWorkMaxValues,
    descriptions: {
      reconciliation_batch_size: 'Maximum current moderation versions per reconciliation page.',
    },
  }),
  'vote-weight-work-config': defineBoundedWorkNamespace({
    namespace: 'vote-weight-work-config',
    config: voteWeightWorkConfig,
    label: 'Vote weight dispatch',
    maxValues: voteWeightWorkMaxValues,
    descriptions: {
      age_milestones_lookback_seconds: 'Age milestone signal lookback; raise after an outage.',
      membership_expirations_lookback_seconds:
        'Membership expiration signal lookback; raise after an outage.',
      family_source_changes_lookback_seconds:
        'Family source signal lookback; raise after an outage.',
      dispatch_batch_size: 'Users per vote weight dispatcher page.',
    },
  }),
  'crawl-boilerplate-removal-work-config': defineBoundedWorkNamespace({
    namespace: 'crawl-boilerplate-removal-work-config',
    config: crawlBoilerplateRemovalWorkConfig,
    label: 'Crawl boilerplate removal',
    maxValues: crawlBoilerplateRemovalWorkMaxValues,
    descriptions: {
      batch_size: 'Boilerplate removal parent paths dispatched per scheduled run.',
      hostname_batch_size: 'Hostnames aggregated per scheduled boilerplate removal run.',
    },
  }),
  'sitemaps-work-config': defineBoundedWorkNamespace({
    namespace: 'sitemaps-work-config',
    config: sitemapsWorkConfig,
    label: 'Sitemaps',
    maxValues: sitemapsWorkMaxValues,
    minValues: { retired_generation_grace_seconds: MIN_RETIRED_GENERATION_GRACE_SECONDS },
    descriptions: {
      archive_backfill_day_page_size: 'Days per archive sitemap backfill page.',
      generation_page_row_limit: 'Source rows read and staged per sitemap generation job.',
      nightly_backfill_days: 'Recent days included by the nightly sitemap dispatcher.',
      weekly_backfill_days: 'Recent days included by the weekly sitemap dispatcher.',
      generation_max_age_seconds:
        'Maximum age of an unfinished sitemap generation before restarting from current sources.',
      retired_generation_grace_seconds:
        'Delay before deleting replaced sitemap child files; minimum covers the edge sitemap TTL and stale window.',
      retired_generation_delete_page_size: 'Retired sitemap child files deleted per cleanup run.',
      retired_generation_record_scan_limit:
        'Retired sitemap generations inspected per cleanup run.',
    },
  }),
  'prioritized-referral-links-work-config': defineBoundedWorkNamespace({
    namespace: 'prioritized-referral-links-work-config',
    config: prioritizedReferralLinksWorkConfig,
    label: 'Prioritized referral links',
    maxValues: prioritizedReferralLinksWorkMaxValues,
    descriptions: {
      personalized_link_limit:
        'Personalized referral links returned when a request does not choose a limit; never above personalized_link_max_limit.',
      personalized_link_max_limit:
        'Most personalized referral links one request may ask for. It sizes the cached out-of-network list (one per program, ranked once): a lower value applies at once, a higher one when the cache next refreshes (within 5 minutes or at the next link write).',
      voted_post_max_age_days:
        'Maximum age in days of a post for a viewer vote on it to count toward ranking referral links (post age, not vote age); cost grows with the window.',
    },
  }),
  'find-your-friends-work-config': defineBoundedWorkNamespace({
    namespace: 'find-your-friends-work-config',
    config: findYourFriendsWorkConfig,
    label: 'Find your friends',
    maxValues: findYourFriendsWorkMaxValues,
    descriptions: {
      enqueue_batch_size: 'Enqueue batch size for find your friends processing.',
    },
  }),
}
