import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { combineBackgroundManifests } from '@queues/background/enqueues/schedules'
import { scheduledJobManifest as accountLifecycle } from '@queues/account-lifecycle/enqueues/schedules'
import { scheduledJobManifest as activitypub } from '@queues/activitypub/enqueues/schedules'
import { scheduledJobManifest as aiAgents } from '@queues/ai-agents/enqueues/schedules'
import { scheduledJobManifest as bedrockEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { scheduledJobManifest as bloomFilters } from '@queues/bloom-filters/enqueues/schedules'
import { scheduledJobManifest as crawlDispatch } from '@queues/crawl-dispatch/enqueues/schedules'
import { scheduledJobManifest as crawlReferralLinks } from '@queues/crawl-referral-links/enqueues/schedules'
import { scheduledJobManifest as emails } from '@queues/emails/enqueues/schedules'
import { scheduledJobManifest as entityListeners } from '@queues/entity-listeners/enqueues/schedules'
import { scheduledJobManifest as findYourFriends } from '@queues/find-your-friends/enqueues/schedules'
import { scheduledJobManifest as heartbeat } from '@queues/heartbeat/enqueues/schedules'
import { scheduledJobManifest as contentAnalysis } from '@queues/content-analysis/enqueues/schedules'
import { scheduledJobManifest as kagiSmallweb } from '@queues/kagi-smallweb/enqueues/schedules'
import { scheduledJobManifest as memberships } from '@queues/memberships/enqueues/schedules'
import { scheduledJobManifest as notifications } from '@queues/notifications/enqueues/schedules'
import { scheduledJobManifest as openaiModeration } from '@queues/openai-moderation/enqueues/schedules'
import { scheduledJobManifest as oauthAuthorizationExchange } from '@queues/oauth-authorization-exchange/enqueues/schedules'
import { scheduledJobManifest as postPublication } from '@queues/post-publication/enqueues/schedules'
import { scheduledJobManifest as psql } from '@queues/psql/enqueues/schedules'
import { scheduledJobManifest as rssFeeds } from '@queues/rss-feeds/enqueues/schedules'
import { scheduledJobManifest as rssFeedMaintenance } from '@queues/rss-feed-maintenance/enqueues/schedules'
import { scheduledJobManifest as sesInbound } from '@queues/ses-inbound/enqueues/schedules'
import { scheduledJobManifest as sitemaps } from '@queues/sitemaps/enqueues/schedules'
import { scheduledJobManifest as storyPostRelatedUrlProjections } from '@queues/story-post-related-url-projections/enqueues/schedules'
import { scheduledJobManifest as unfurlReferralLinks } from '@queues/unfurl-referral-links/enqueues/schedules'
import { scheduledJobManifest as urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { scheduledJobManifest as voteWeight } from '@queues/vote-aggregation/enqueues/schedules'

// Background domains register through one combined manifest, so the catalog lists that manifest.
const background = combineBackgroundManifests([sesInbound, openaiModeration])

export const SCHEDULED_JOB_MANIFESTS = [
  accountLifecycle,
  activitypub,
  aiAgents,
  background,
  bedrockEmbeddingsBatch,
  bloomFilters,
  crawlDispatch,
  crawlReferralLinks,
  emails,
  entityListeners,
  findYourFriends,
  heartbeat,
  contentAnalysis,
  kagiSmallweb,
  memberships,
  notifications,
  oauthAuthorizationExchange,
  postPublication,
  psql,
  rssFeeds,
  rssFeedMaintenance,
  sitemaps,
  storyPostRelatedUrlProjections,
  unfurlReferralLinks,
  urlsDomainsBlacklist,
  voteWeight,
] satisfies readonly ScheduledJobManifest[]
