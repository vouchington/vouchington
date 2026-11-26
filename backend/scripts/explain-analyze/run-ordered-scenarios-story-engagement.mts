import { runStorySearchScenarios } from './run-scenarios/story-search.mts'
import { runSharedLoaderScenarios } from './run-scenarios/shared-loaders.mts'
import { runRssItemEmbedCapacityScenario } from './run-scenarios/rss-item-embed-capacity.mts'
import { runMembershipWorkSelectionScenarios } from './run-scenarios/membership-work-selection.mts'
import { runFeedSharerHydrationCapacityScenario } from './run-scenarios/feed-sharer-hydration-capacity.mts'
import { runEngagementEmailRecipientScenarios } from './run-scenarios/engagement-email-recipients.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'

export const STORY_ENGAGEMENT_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // Hidden-feed story search leaves 240 story_posts rows. Profile collection pages join
  // that table, and the generic plan sorts once those rows exist.
  runStorySearchScenarios,
  runSharedLoaderScenarios,
  runRssItemEmbedCapacityScenario,
  runMembershipWorkSelectionScenarios,
  runFeedSharerHydrationCapacityScenario,
  runEngagementEmailRecipientScenarios,
  runRemoteFollowerScenarios,
  runReviewSuccessionScenarios,
]
