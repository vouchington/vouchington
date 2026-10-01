import type { Job } from 'glide-mq'
import type { AutotaggerRssFeedItemJobData } from '@queues/ai-agents/types'
import { applyCollaborativeTopicRelations } from '@services/rss-feed-items/collaborative-topic-relations'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getAutotaggerPaidLimitsFields } from '@services/autotagger'

/**
 * The collaborative-follower pass for one RSS feed item, gated only on the autotagger kill switch.
 * It derives topics from current follow and vote relations, not from classifier output, so it
 * needs no embedding and no model call. The topic classification of the same item is C6 on the
 * shared classifier-run lifecycle (`classifier-run-autotagger.mts`), requested at upsert and
 * recovered by its sweep; nothing here dispatches or waits for it. The pass is idempotent, so a
 * queue retry re-applying it is safe.
 */
export async function processAutotaggerRssFeedItem(
  job: Job<AutotaggerRssFeedItemJobData>,
): Promise<null> {
  const { enabled, rss_collaborative_plus_max_topics, rss_collaborative_pro_max_topics } =
    getAutotaggerPaidLimitsFields()
  if (!enabled) return null

  const item = await getRssFeedItemById(job.data.rss_feed_item_id)
  if (!item) return null

  await applyCollaborativeTopicRelations(item.id, {
    plusLimit: rss_collaborative_plus_max_topics,
    proLimit: rss_collaborative_pro_max_topics,
  })
  return null
}
