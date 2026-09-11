import type { Job } from 'glide-mq'
import type { AutotaggerPostJobData, AutotaggerRssFeedItemJobData } from '@queues/ai-agents/types'
import type { Post } from '@services/posts/types'
import { getPostByAny } from '@services/posts/get'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { hasRssFeedItemEmbedding } from '@services/bedrock-embeddings'
import { runAutotaggerOnPost, runAutotaggerOnRssFeedItem } from '@agents/autotagger'
import { enqueueAutotaggerRssFeedItem } from '@queues/ai-agents/enqueues/autotagger'
import {
  getAutotaggerPaidLimitsFields,
  type AutotaggerPaidLimitsFields,
} from '@services/autotagger'
import { getPrivateUserByAny } from '@services/users'
import { getUserActivePlan } from '@services/memberships'

type AutotaggerDependencies = {
  enqueueAutotaggerRssFeedItem: typeof enqueueAutotaggerRssFeedItem
  runAutotaggerOnPost: typeof runAutotaggerOnPost
  runAutotaggerOnRssFeedItem: typeof runAutotaggerOnRssFeedItem
}

export async function processAutotaggerPost(
  job: Job<AutotaggerPostJobData>,
  dependencies?: Partial<AutotaggerDependencies>,
): Promise<unknown> {
  const runOnPost = dependencies?.runAutotaggerOnPost ?? runAutotaggerOnPost
  const post = await getPostByAny(job.data.id)
  if (!post) return null
  if (post.openai_omni_moderation_flagged) return null

  const limits = getAutotaggerPaidLimitsFields()
  if (!limits.enabled) return null

  const maxTopics = await resolvePostAutotaggerMaxTopics(post, limits)
  // Free-tier authors (including authorless posts) get zero autotagger topics -- skip before any
  // content is built or OpenAI is called, since there is nothing further to do at max_topics: 0.
  if (maxTopics === 0) return null

  return runOnPost(post, undefined, { max_topics: maxTopics })
}

export async function processAutotaggerRssFeedItem(
  job: Job<AutotaggerRssFeedItemJobData>,
  dependencies?: Partial<AutotaggerDependencies>,
): Promise<unknown> {
  const enqueueRssFeedItem =
    dependencies?.enqueueAutotaggerRssFeedItem ?? enqueueAutotaggerRssFeedItem
  const runOnRssFeedItem = dependencies?.runAutotaggerOnRssFeedItem ?? runAutotaggerOnRssFeedItem
  const rssFeedItem = await getRssFeedItemById(job.data.rss_feed_item_id)
  if (!rssFeedItem) return null

  const hasEmbedding = await hasRssFeedItemEmbedding(job.data.rss_feed_item_id)
  if (!hasEmbedding) {
    const retries = job.data.embedding_retries ?? 0
    if (retries >= 10)
      throw new Error(
        `Embeddings never generated for rss_feed_item ${job.data.rss_feed_item_id} after ${retries} retries`,
      )
    void enqueueRssFeedItem(job.data.rss_feed_item_id, retries + 1)
    return null
  }

  // Kill-switch, discoverability gating, tiered max_topics, and the collaborative-follower
  // enrichment pass all live inside runAutotaggerOnRssFeedItem (@agents/autotagger/run.mts) rather
  // than here: the collaborative pass must run (and its topics be visible) before the
  // rss_feed_item_autotagger_results idempotency marker is written, so that ordering constraint
  // requires it to sit inside the same generic run/insert flow, not be layered on afterward here.
  return runOnRssFeedItem(rssFeedItem)
}

/**
 * Resolves the post author's autotagger topic cap: admins and pro-plan authors get the pro cap,
 * plus-plan authors get the plus cap, everyone else (including posts with no author) gets the
 * free cap -- which defaults to 0, i.e. no autotagging.
 */
async function resolvePostAutotaggerMaxTopics(
  post: Post,
  limits: AutotaggerPaidLimitsFields,
): Promise<number> {
  const authorId = post.created_by_id
  if (!authorId) return limits.post_free_max_topics

  const [author, plan] = await Promise.all([
    getPrivateUserByAny(authorId),
    getUserActivePlan(authorId),
  ])

  if (author?.roles.includes('administrator')) return limits.post_pro_max_topics
  if (plan === 'pro') return limits.post_pro_max_topics
  if (plan === 'plus') return limits.post_plus_max_topics
  return limits.post_free_max_topics
}
