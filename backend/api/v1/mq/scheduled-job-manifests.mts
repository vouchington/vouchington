import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { scheduledJobManifest as accountDataRequests } from '@queues/account-data-requests/enqueues/schedules'
import { scheduledJobManifest as activitypubInbox } from '@queues/activitypub-inbox/enqueues/schedules'
import { scheduledJobManifest as aiAgents } from '@queues/ai-agents/enqueues/schedules'
import { scheduledJobManifest as bedrockEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { scheduledJobManifest as bloomFilters } from '@queues/bloom-filters/enqueues/schedules'
import { scheduledJobManifest as crawlBoilerplateRemoval } from '@queues/crawl-boilerplate-removal/enqueues/schedules'
import { scheduledJobManifest as crawlHostnames } from '@queues/crawl-hostnames/enqueues/schedules'
import { scheduledJobManifest as crawlReferralLinks } from '@queues/crawl-referral-links/enqueues/schedules'
import { scheduledJobManifest as emails } from '@queues/emails/enqueues/schedules'
import { scheduledJobManifest as entityListeners } from '@queues/entity-listeners/enqueues/schedules'
import { scheduledJobManifest as findYourFriends } from '@queues/find-your-friends/enqueues/schedules'
import { scheduledJobManifest as heartbeat } from '@queues/heartbeat/enqueues/schedules'
import { scheduledJobManifest as images } from '@queues/images/enqueues/schedules'
import { scheduledJobManifest as kagiSmallweb } from '@queues/kagi-smallweb/enqueues/schedules'
import { scheduledJobManifest as memberships } from '@queues/memberships/enqueues/schedules'
import { scheduledJobManifest as notifications } from '@queues/notifications/enqueues/schedules'
import { scheduledJobManifest as oauthAuthorizationExchange } from '@queues/oauth-authorization-exchange/enqueues/schedules'
import { scheduledJobManifest as postPublication } from '@queues/post-publication/enqueues/schedules'
import { scheduledJobManifest as psql } from '@queues/psql/enqueues/schedules'
import { scheduledJobManifest as rssFeeds } from '@queues/rss-feeds/enqueues/schedules'
import { scheduledJobManifest as rssFeedItemCategories } from '@queues/rss-feed-item-categories/enqueues/schedules'
import { scheduledJobManifest as sesInbound } from '@queues/ses-inbound/enqueues/schedules'
import { scheduledJobManifest as sitemaps } from '@queues/sitemaps/enqueues/schedules'
import { scheduledJobManifest as storyPostRelatedUrlProjections } from '@queues/story-post-related-url-projections/enqueues/schedules'
import { scheduledJobManifest as topicAliases } from '@queues/topic-aliases/enqueues/schedules'
import { scheduledJobManifest as unfurlReferralLinks } from '@queues/unfurl-referral-links/enqueues/schedules'
import { scheduledJobManifest as urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { scheduledJobManifest as userDeletions } from '@queues/user-deletions/enqueues/schedules'
import { scheduledJobManifest as voteWeight } from '@queues/vote-weight/enqueues/schedules'
import { scheduledJobManifest as wikipediaRecommender } from '@queues/wikipedia-recommender/enqueues/schedules'

export const SCHEDULED_JOB_MANIFESTS = [
  accountDataRequests,
  activitypubInbox,
  aiAgents,
  bedrockEmbeddingsBatch,
  bloomFilters,
  crawlBoilerplateRemoval,
  crawlHostnames,
  crawlReferralLinks,
  emails,
  entityListeners,
  findYourFriends,
  heartbeat,
  images,
  kagiSmallweb,
  memberships,
  notifications,
  oauthAuthorizationExchange,
  postPublication,
  psql,
  rssFeeds,
  rssFeedItemCategories,
  sesInbound,
  sitemaps,
  storyPostRelatedUrlProjections,
  topicAliases,
  unfurlReferralLinks,
  urlsDomainsBlacklist,
  userDeletions,
  voteWeight,
  wikipediaRecommender,
] satisfies readonly ScheduledJobManifest[]
