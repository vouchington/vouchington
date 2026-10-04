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
  'moderation-analytics-work-config': defineBoundedWorkNamespace(
    moderationAnalyticsWorkConfig,
    'Moderation analytics',
    moderationAnalyticsWorkMaxValues,
    { leaderboard_page_size: 'Moderators included in the activity leaderboard.' },
  ),
  'users-work-config': defineBoundedWorkNamespace(usersWorkConfig, 'Users', usersWorkMaxValues, {
    engagement_claim_hours: 'Engagement claim hours for background processing.',
  }),
  'post-clearance-work-config': defineBoundedWorkNamespace(
    postClearanceWorkConfig,
    'Post clearance',
    postClearanceWorkMaxValues,
    {
      attempt_lease_minutes: 'Attempt lease minutes for background processing.',
      first_retry_minutes: 'First retry minutes for background processing.',
      later_retry_minutes: 'Later retry minutes for background processing.',
    },
  ),
  'vote-weight-work-config': defineBoundedWorkNamespace(
    voteWeightWorkConfig,
    'Vote weight dispatch',
    voteWeightWorkMaxValues,
    { dispatch_batch_size: 'Users per vote weight dispatcher page.' },
  ),
  'crawl-boilerplate-removal-work-config': defineBoundedWorkNamespace(
    crawlBoilerplateRemovalWorkConfig,
    'Crawl boilerplate removal',
    crawlBoilerplateRemovalWorkMaxValues,
    { batch_size: 'HTML snapshots per boilerplate removal batch.' },
  ),
  'find-your-friends-work-config': defineBoundedWorkNamespace(
    findYourFriendsWorkConfig,
    'Find your friends',
    findYourFriendsWorkMaxValues,
    {
      enqueue_batch_size: 'Enqueue batch size for find your friends processing.',
    },
  ),
}
