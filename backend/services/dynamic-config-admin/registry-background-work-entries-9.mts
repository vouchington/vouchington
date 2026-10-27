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
  MIN_RETIRED_GENERATION_GRACE_SECONDS,
  sitemapsWorkConfig,
  sitemapsWorkMaxValues,
} from '@services/sitemaps/work-limits'

export const backgroundWorkRegistryEntries9 = {
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
      reconciliation_batch_size:
        'Maximum due and expired moderation work items per reconciliation run.',
      attempt_lease_minutes: 'Attempt lease minutes for background processing.',
      first_retry_minutes: 'First retry minutes for background processing.',
      later_retry_minutes: 'Later retry minutes for background processing.',
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
    descriptions: { batch_size: 'HTML snapshots per boilerplate removal batch.' },
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
