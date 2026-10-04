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
} from '@queues/crawl-boilerplate-removal/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  findYourFriendsWorkConfig,
  findYourFriendsWorkMaxValues,
} from '@queues/find-your-friends/config'

export const backgroundWorkRegistryEntries9 = {
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
    descriptions: { dispatch_batch_size: 'Users per vote weight dispatcher page.' },
  }),
  'crawl-boilerplate-removal-work-config': defineBoundedWorkNamespace({
    namespace: 'crawl-boilerplate-removal-work-config',
    config: crawlBoilerplateRemovalWorkConfig,
    label: 'Crawl boilerplate removal',
    maxValues: crawlBoilerplateRemovalWorkMaxValues,
    descriptions: { batch_size: 'HTML snapshots per boilerplate removal batch.' },
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
