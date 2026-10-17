import { background } from '@queues/background/queues'
import { crawlEmbedsQueue } from '@queues/crawl-embeds/queues'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { emails } from '@queues/emails/queues'
import * as bedrockEmbeddingsQueues from '@queues/bedrock-embeddings/queues'
import {
  bedrock_embeddings_batch,
  bedrock_embeddings_batch_creation,
} from '@queues/bedrock-embeddings-batch/queues'
import { psql } from '@queues/psql/queues'
import * as crawlerQueues from '@queues/crawler/queues'
import * as crawlDispatchQueues from '@queues/crawl-dispatch/queues'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { memberships } from '@queues/memberships/queues'
import { spam_detection } from '@queues/spam-detection/queues'
import { ai_agents as aiAgentsQueue, spendCapRechecks } from '@queues/ai-agents/queues'
import { ban_evasion as banEvasion } from '@queues/ban-evasion/queues'
import { crawlBrowserQueue } from '@queues/crawl-browser/queues'
import { contentAnalysisQueue } from '@queues/content-analysis/queues'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import type { Queue } from 'glide-mq'

const allQueues = [
  background,
  crawlEmbedsQueue,
  rssFeedMaintenance,
  emails,
  psql,
  ...Object.values(crawlerQueues),
  ...Object.values(crawlDispatchQueues),
  ...Object.values(bedrockEmbeddingsQueues),
  bedrock_embeddings_batch,
  bedrock_embeddings_batch_creation,
  bloomFilters,
  crawlReferralLinksQueue,
  findYourFriendsQueue,
  imageUploadsQueue,
  memberships,
  spam_detection,
  aiAgentsQueue,
  spendCapRechecks,
  banEvasion,
  crawlBrowserQueue,
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
