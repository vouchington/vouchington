import { background } from '@queues/background/queues'
import { emails } from '@queues/emails/queues'
import { urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/queues'
import { userRssFeedImports } from '@queues/user-rss-feed-imports/queues'
import * as bedrockEmbeddingsQueues from '@queues/bedrock-embeddings/queues'
import {
  bedrock_embeddings_batch,
  bedrock_embeddings_batch_creation,
} from '@queues/bedrock-embeddings-batch/queues'
import { psql } from '@queues/psql/queues'
import * as crawlerQueues from '@queues/crawler/queues'
import * as crawlDispatchQueues from '@queues/crawl-dispatch/queues'
import { rss_feeds } from '@queues/rss-feeds/queues'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { adminImports } from '@queues/admin-imports/queues'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import { memberships } from '@queues/memberships/queues'
import { notifications } from '@queues/notifications/queues'
import { sitemaps } from '@queues/sitemaps/queues'
import { spam_detection } from '@queues/spam-detection/queues'
import { ai_agents as aiAgentsQueue, spendCapRechecks } from '@queues/ai-agents/queues'
import { activitypub } from '@queues/activitypub/queues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import { ban_evasion as banEvasion } from '@queues/ban-evasion/queues'
import { cachePurge } from '@queues/cache-purge/queues'
import { crawlBrowserQueue } from '@queues/crawl-browser/queues'
import { crawlEmbedsQueue } from '@queues/crawl-embeds/queues'
import { contentAnalysisQueue } from '@queues/content-analysis/queues'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import type { Queue } from 'glide-mq'

const allQueues = [
  background,
  emails,
  urlsDomainsBlacklist,
  userRssFeedImports,
  psql,
  ...Object.values(crawlerQueues),
  ...Object.values(crawlDispatchQueues),
  rss_feeds,
  rssFeedMaintenance,
  ...Object.values(bedrockEmbeddingsQueues),
  bedrock_embeddings_batch,
  bedrock_embeddings_batch_creation,
  bloomFilters,
  adminImports,
  crawlReferralLinksQueue,
  findYourFriendsQueue,
  followerDistributions,
  imageUploadsQueue,
  kagiSmallWeb,
  memberships,
  notifications,
  sitemaps,
  spam_detection,
  aiAgentsQueue,
  spendCapRechecks,
  activitypub,
  blueskyFollowPropagation,
  banEvasion,
  cachePurge,
  crawlBrowserQueue,
  crawlEmbedsQueue,
  contentAnalysisQueue,
  unfurlReferralLinksQueue,
]
  .flat(Infinity)
  .filter(Boolean) as Queue[]

export default allQueues
export const QUEUE_NAMES = [...new Set(allQueues.map(queue => queue.name))]
export function findQueueByName(name: string) {
  return allQueues.find(queue => queue.name === name)
}
