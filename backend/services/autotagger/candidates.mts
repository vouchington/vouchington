import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import { getUserActivePlan } from '@services/memberships'
import { getRssFeedItemMappedTopics } from '@services/rss-feed-items/category-relations'
import { isRssFeedItemFromDiscoverableSource } from '@services/rss-feed-items/discoverability'
import { searchTopicsByPostEmbedding } from '@services/topics/tools/by-post-embedding'
import { searchTopicsByRssFeedItemEmbedding } from '@services/topics/tools/by-rss-feed-item-embedding'
import { getPrivateUserByAny } from '@services/users'
import sql from 'sql-template-strings'
import { getAutotaggerPaidLimitsFields, type AutotaggerPaidLimitsFields } from './limits-config.mts'

type CandidateTopic = { id: string; name: string }

/**
 * The post author's topic cap: admins and pro authors get the pro cap, plus authors the plus cap,
 * everyone else (including an authorless post) the free cap, which defaults to no autotagging.
 */
async function resolvePostMaxTopics(
  query: OwnedTransaction,
  postId: string,
  limits: AutotaggerPaidLimitsFields,
): Promise<number> {
  const { rows } = await query<{ created_by_id: string | null }>(sql`
    /* readAutotaggerPostAuthor */
    SELECT created_by_id FROM posts WHERE id = ${postId}
  `)
  const authorId = rows[0]?.created_by_id
  if (!authorId) return limits.post_free_max_topics
  const [author, plan] = await Promise.all([
    getPrivateUserByAny(authorId, { readOnly: false }),
    getUserActivePlan(authorId, { readOnly: false }),
  ])
  if (author?.roles.includes('administrator') || plan === 'pro') return limits.post_pro_max_topics
  return plan === 'plus' ? limits.post_plus_max_topics : limits.post_free_max_topics
}

/**
 * Feed-declared categories first (explicitly author-tagged), then embedding-similar topics,
 * deduplicated by id and capped at the discoverable-source budget.
 */
async function searchFeedItemTopics(
  query: OwnedTransaction,
  rssFeedItemId: string,
  limit: number,
): Promise<CandidateTopic[]> {
  const [vectorTopics, feedTopics] = await Promise.all([
    searchTopicsByRssFeedItemEmbedding(rssFeedItemId, limit, query),
    getRssFeedItemMappedTopics(rssFeedItemId, limit, query),
  ])
  const byId = new Map<string, CandidateTopic>()
  for (const topic of [...feedTopics, ...vectorTopics])
    byId.set(topic.id, byId.get(topic.id) ?? topic)
  return [...byId.values()].slice(0, limit)
}

/**
 * Chooses the topics one C6 run asks about. It runs once, when the run's receipt is first reserved,
 * and its result is stored with the receipt, so a later search result or a plan change cannot alter
 * what an existing receipt asks. Null means there is nothing to classify.
 */
export async function captureAutotaggerCandidateTopicIds(
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
): Promise<readonly string[] | null> {
  const limits = getAutotaggerPaidLimitsFields()
  if (subject.postId !== null) {
    const maxTopics = await resolvePostMaxTopics(query, subject.postId, limits)
    if (maxTopics === 0) return null
    const topics = await searchTopicsByPostEmbedding(subject.postId, maxTopics, query)
    return topics.map(topic => topic.id)
  }
  const limit = limits.rss_discoverable_llm_max_topics
  if (limit === 0 || !(await isRssFeedItemFromDiscoverableSource(subject.rssFeedItemId, query))) {
    return null
  }
  const topics = await searchFeedItemTopics(query, subject.rssFeedItemId, limit)
  return topics.map(topic => topic.id)
}
