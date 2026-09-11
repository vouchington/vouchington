import { emails } from '@queues/emails/queues'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/queues'
import { userRssFeedImports } from '@queues/user-rss-feed-imports/queues'
import * as bedrockEmbeddingsQueues from '@queues/bedrock-embeddings/queues'
import { bedrock_embeddings_batch } from '@queues/bedrock-embeddings-batch/queues'
import * as openaiModerationQueues from '@queues/openai-moderation/queues'
import * as topicRatingsQueues from '@queues/topic-ratings/queues'
import { elections } from '@queues/elections/queues'
import * as entityMetricsCacheRefreshQueues from '@queues/entity-metrics-cache-refresh/queues'
import { psql } from '@queues/psql/queues'
import * as crawlerQueues from '@queues/crawler/queues'
import * as crawlHostnamesQueues from '@queues/crawl-hostnames/queues'
import * as crawlBoilerplateRemovalQueues from '@queues/crawl-boilerplate-removal/queues'
import { rss_feeds } from '@queues/rss-feeds/queues'
import { rssFeedItemCategories } from '@queues/rss-feed-item-categories/queues'
import { topicAliases } from '@queues/topic-aliases/queues'
import { wikipediaRecommender } from '@queues/wikipedia-recommender/queues'
import { accountDataRequests } from '@queues/account-data-requests/queues'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { adminImports } from '@queues/admin-imports/queues'
import { articleSync } from '@queues/article-sync/queues'
import { customer_support as customerSupportQueue } from '@queues/customer-support/queues'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { imagesQueue } from '@queues/images/queues'
import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import { memberships } from '@queues/memberships/queues'
import { notifications } from '@queues/notifications/queues'
import { postMentions } from '@queues/post-mentions/queues'
import { postPublication } from '@queues/post-publication/queues'
import { sitemaps } from '@queues/sitemaps/queues'
import { spam_detection } from '@queues/spam-detection/queues'
import { storyPostRelatedUrlProjections } from '@queues/story-post-related-url-projections/queues'
import { voteIntegrityQueue } from '@queues/vote-integrity/queues'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import { ai_agents as aiAgentsQueue, openAiSpendCapRechecks } from '@queues/ai-agents/queues'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import { activitypubInbox } from '@queues/activitypub-inbox/queues'
import { ban_evasion as banEvasion } from '@queues/ban-evasion/queues'
import { cachePurge } from '@queues/cache-purge/queues'
import { crawlBrowserQueue } from '@queues/crawl-browser/queues'
import { crawlEmbedsQueue } from '@queues/crawl-embeds/queues'
import { language_detection as languageDetection } from '@queues/language-detection/queues'
import { oauthAuthorizationExchangeQueue } from '@queues/oauth-authorization-exchange/queues'
import { reportIntegrityQueue } from '@queues/report-integrity/queues'
import { rssFeedDiscoverability } from '@queues/rss-feed-discoverability/queues'
import { sesInboundQueue } from '@queues/ses-inbound/queues'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { userDeletions } from '@queues/user-deletions/queues'
import type { Queue } from 'glide-mq'

export default [
  emails,
  entitiesListeners,
  urlsDomainsBlacklist,
  userRssFeedImports,
  ...Object.values(topicRatingsQueues),
  elections,
  ...Object.values(entityMetricsCacheRefreshQueues),
  psql,
  ...Object.values(crawlerQueues),
  ...Object.values(crawlHostnamesQueues),
  ...Object.values(crawlBoilerplateRemovalQueues),
  rss_feeds,
  rssFeedItemCategories,
  topicAliases,
  ...Object.values(bedrockEmbeddingsQueues),
  bedrock_embeddings_batch,
  ...Object.values(openaiModerationQueues),
  wikipediaRecommender,
  accountDataRequests,
  bloomFilters,
  adminImports,
  articleSync,
  customerSupportQueue,
  crawlReferralLinksQueue,
  findYourFriendsQueue,
  followerDistributions,
  imagesQueue,
  kagiSmallWeb,
  memberships,
  notifications,
  postMentions,
  postPublication,
  sitemaps,
  spam_detection,
  storyPostRelatedUrlProjections,
  voteIntegrityQueue,
  voteWeightQueue,
  aiAgentsQueue,
  openAiSpendCapRechecks,
  activitypubDelivery,
  blueskyFollowPropagation,
  activitypubInbox,
  banEvasion,
  cachePurge,
  crawlBrowserQueue,
  crawlEmbedsQueue,
  languageDetection,
  oauthAuthorizationExchangeQueue,
  reportIntegrityQueue,
  rssFeedDiscoverability,
  sesInboundQueue,
  unfurlReferralLinksQueue,
  userDeletions,
]
  .flat(Infinity)
  .filter(Boolean) as Queue[]
