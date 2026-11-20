import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { combineBackgroundManifests } from '@queues/background/enqueues/schedules'
import { combineBackgroundCpuManifests } from '@queues/background-cpu/enqueues/schedules'
import { scheduledJobManifest as accountLifecycle } from '@queues/account-lifecycle/enqueues/schedules'
import { scheduledJobManifest as activitypub } from '@queues/activitypub/enqueues/schedules'
import { scheduledJobManifest as aiAgents } from '@queues/ai-agents/enqueues/schedules'
import { scheduledJobManifest as geminiEmbeddingsBatch } from '@queues/gemini-embeddings-batch/enqueues/schedules'
import { scheduledJobManifest as bloomFilters } from '@queues/bloom-filters/enqueues/schedules'
import { scheduledJobManifest as crawlDispatch } from '@queues/crawl-dispatch/enqueues/schedules'
import { scheduledJobManifest as crawlReferralLinks } from '@queues/crawl-referral-links/enqueues/schedules'
import { scheduledJobManifest as emailDigests } from '@queues/email-digests/enqueues/schedules'
import { scheduledJobManifest as entityListeners } from '@queues/entity-listeners/enqueues/schedules'
import { scheduledJobManifest as findYourFriends } from '@queues/find-your-friends/enqueues/schedules'
import { scheduledJobManifest as hackerNewsFlags } from '@queues/hacker-news-flags/enqueues/schedules'
import { scheduledJobManifest as hackerNews } from '@queues/hacker-news/enqueues/schedules'
import { scheduledJobManifest as heartbeat } from '@queues/heartbeat/enqueues/schedules'
import { scheduledJobManifest as contentAnalysis } from '@queues/content-analysis/enqueues/schedules'
import { scheduledJobManifest as memberships } from '@queues/memberships/enqueues/schedules'
import { scheduledJobManifest as notifications } from '@queues/notifications/enqueues/schedules'
import { scheduledJobManifest as openaiModeration } from '@queues/openai-moderation/enqueues/schedules'
import { scheduledJobManifest as oauthAuthorizationExchange } from '@queues/oauth-authorization-exchange/enqueues/schedules'
import { scheduledJobManifest as psql } from '@queues/psql/enqueues/schedules'
import { scheduledJobManifest as rssFeeds } from '@queues/rss-feeds/enqueues/schedules'
import { scheduledJobManifest as rssFeedMaintenance } from '@queues/rss-feed-maintenance/enqueues/schedules'
import { scheduledJobManifest as sesInbound } from '@queues/ses-inbound/enqueues/schedules'
import { scheduledJobManifest as sitemaps } from '@queues/sitemaps/enqueues/schedules'
import { scheduledJobManifest as storyPostRelatedUrlProjections } from '@queues/story-post-related-url-projections/enqueues/schedules'
import { scheduledJobManifest as unfurlReferralLinks } from '@queues/unfurl-referral-links/enqueues/schedules'
import { scheduledJobManifest as urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { scheduledJobManifest as userRssFeedImports } from '@queues/user-rss-feed-imports/enqueues/schedules'
import { scheduledJobManifest as voteWeight } from '@queues/vote-aggregation/enqueues/schedules'
import { scheduledJobManifest as hostnameBlocking } from '@queues/background/enqueues/hostname-blocking-schedules'
import { scheduledJobManifest as topicMerge } from '@queues/background/enqueues/topic-merge-schedules'
import { scheduledJobManifest as emails } from '@queues/emails/enqueues/schedules'
import { scheduledJobManifest as crawlBrowser } from '@queues/crawl-browser/enqueues/schedules'
import { scheduledJobManifest as crawlEmbeds } from '@queues/crawl-embeds/enqueues/schedules'
import { scheduledJobManifest as imageUploads } from '@queues/image-uploads/enqueues/schedules'

// Background domains register through one combined manifest, so the catalog lists that manifest.
const background = combineBackgroundManifests([
  sesInbound,
  openaiModeration,
  entityListeners,
  storyPostRelatedUrlProjections,
  voteWeight,
  accountLifecycle,
  oauthAuthorizationExchange,
  notifications,
  activitypub,
  rssFeeds,
  urlsDomainsBlacklist,
  sitemaps,
  emailDigests,
  userRssFeedImports,
  hostnameBlocking,
  topicMerge,
])

const backgroundCpu = combineBackgroundCpuManifests([
  crawlDispatch,
  crawlReferralLinks,
  unfurlReferralLinks,
  contentAnalysis,
  geminiEmbeddingsBatch,
])

export const SCHEDULED_JOB_MANIFESTS = [
  aiAgents,
  background,
  backgroundCpu,
  bloomFilters,
  crawlBrowser,
  crawlEmbeds,
  emails,
  findYourFriends,
  hackerNews,
  hackerNewsFlags,
  heartbeat,
  imageUploads,
  memberships,
  psql,
  rssFeedMaintenance,
] satisfies readonly ScheduledJobManifest[]
