import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { buildRssFeedItemClassifierState } from './content.mts'
import { searchTopicsByRssFeedItemEmbedding } from '@services/topics/tools/by-rss-feed-item-embedding'
import { getRssFeedItemMappedTopics } from '@services/rss-feed-items/categories'
import { isRssFeedItemFromDiscoverableSource } from '@services/rss-feed-items/discoverability'
import { applyCollaborativeTopicRelations } from '@services/rss-feed-items/collaborative-topic-relations'
import { getAutotaggerPaidLimitsFields } from '@services/autotagger'
import {
  dispatchAutotaggerClassifier,
  type AutotaggerClassifierDispatchDeps,
} from './dispatch-classifier.mts'

export type RssFeedItemAutotagRunResult = { topics_added: readonly string[] }

// The only overridable seam is the provider boundary (AutotaggerClassifierDispatchDeps.createClient,
// dispatch-classifier.mts) -- per the repository's test-mocking rule, embedding/feed-topic search,
// state building, the collaborative pass, and dispatch itself always run for real, even in tests.
export type RssAutotaggerDeps = AutotaggerClassifierDispatchDeps

/**
 * Combines feed-declared categories with embedding-similarity candidates, feed-declared first
 * (explicitly author-tagged), dedup by id, capped at `limit` -- the resolved
 * `rss_discoverable_llm_max_topics` tier budget, which is also the digest's `effectiveCap`.
 */
async function searchRssFeedItemCandidateTopics(
  itemId: string,
  limit: number,
): Promise<{ id: string; name: string }[]> {
  const [vectorTopics, feedTopics] = await Promise.all([
    searchTopicsByRssFeedItemEmbedding(itemId, limit),
    getRssFeedItemMappedTopics(itemId, limit),
  ])
  const seen = new Set<string>()
  const combined: { id: string; name: string }[] = []
  for (const topic of [...feedTopics, ...vectorTopics]) {
    if (seen.has(topic.id)) continue
    seen.add(topic.id)
    combined.push(topic)
    if (combined.length >= limit) break
  }
  return combined
}

/**
 * C6 entry point for RSS feed item autotagging. Two independent passes:
 *
 * 1. The collaborative-follower pass (`applyCollaborativeTopicRelations`), gated only on the
 *    `enabled` kill-switch -- not on discoverability or the classifier outcome. It derives topics
 *    from current follow/vote relations, not from classifier output (the old engine discarded its
 *    own `llmAddedTopicIds` here too), so it runs first and unconditionally when enabled: a
 *    classifier dispatch error must not block it, and it must not wait on the classifier's own
 *    lease/retry semantics. It is idempotent on every call, so a queue retry re-applying it is safe.
 * 2. The classifier dispatch pass, gated on discoverability and a non-zero
 *    `rss_discoverable_llm_max_topics` tier budget, combining feed-declared categories with
 *    embedding-similarity candidates before dispatching through the shared receipt/classifier path
 *    (dispatch-classifier.mts).
 *
 * Any classifier dispatch error is left to propagate to the caller -- see runAutotaggerOnPost's
 * docstring in run.mts for why this no longer swallows errors into a result field.
 */
export async function runAutotaggerOnRssFeedItem(
  item: ViewRssFeedItem,
  deps: RssAutotaggerDeps = {},
): Promise<RssFeedItemAutotagRunResult | null> {
  const {
    enabled,
    rss_discoverable_llm_max_topics,
    rss_collaborative_plus_max_topics,
    rss_collaborative_pro_max_topics,
  } = getAutotaggerPaidLimitsFields()

  if (enabled) {
    await applyCollaborativeTopicRelations(item.id, {
      plusLimit: rss_collaborative_plus_max_topics,
      proLimit: rss_collaborative_pro_max_topics,
    })
  }

  if (!enabled || rss_discoverable_llm_max_topics === 0) return null
  if (!(await isRssFeedItemFromDiscoverableSource(item.id))) return null

  const candidates = await searchRssFeedItemCandidateTopics(
    item.id,
    rss_discoverable_llm_max_topics,
  )
  if (candidates.length === 0) return null

  const state = await buildRssFeedItemClassifierState(item)

  const result = await dispatchAutotaggerClassifier(
    {
      subject: { postId: null, rssFeedItemId: item.id },
      state,
      candidates: candidates.map(candidate => ({ topicId: candidate.id, name: candidate.name })),
      maxCandidates: rss_discoverable_llm_max_topics,
    },
    deps,
  )
  if (!result) return null
  return { topics_added: result.topicIds }
}
