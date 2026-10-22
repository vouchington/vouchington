import { background } from '@queues/background/queues'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { bedrockEmbeddingsCreation } from '@queues/bedrock-embeddings-batch/queues'
import { crawlEmbedsQueue } from '@queues/crawl-embeds/queues'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { emails } from '@queues/emails/queues'
import { psql } from '@queues/psql/queues'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { memberships } from '@queues/memberships/queues'
import { ai_agents as aiAgentsQueue } from '@queues/ai-agents/queues'
import { crawlBrowserQueue } from '@queues/crawl-browser/queues'
import type { Queue } from 'glide-mq'

const allQueues = [
  background,
  backgroundCpu,
  bedrockEmbeddingsCreation,
  crawlEmbedsQueue,
  rssFeedMaintenance,
  emails,
  psql,
  bloomFilters,
  findYourFriendsQueue,
  imageUploadsQueue,
  memberships,
  aiAgentsQueue,
  crawlBrowserQueue,
] satisfies Queue[]

export default allQueues
export const QUEUE_NAMES = [...new Set(allQueues.map(queue => queue.name))]
export function findQueueByName(name: string) {
  return allQueues.find(queue => queue.name === name)
}
