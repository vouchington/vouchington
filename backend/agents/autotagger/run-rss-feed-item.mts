import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { createRssFeedItemAutotagContent } from './content.mts'
import { searchTopicsByRssFeedItemEmbedding } from '@services/topics/tools/by-rss-feed-item-embedding'
import { getRssFeedItemMappedTopics } from '@services/rss-feed-items/categories'
import { isRssFeedItemFromDiscoverableSource } from '@services/rss-feed-items/discoverability'
import { applyCollaborativeTopicRelations } from '@services/rss-feed-items/collaborative-topic-relations'
import {
  hasExistingRssFeedItemAutotagging,
  insertRssFeedItemAutotaggingResult,
  getAutotaggerPaidLimitsFields,
  type RssFeedItemAutotagResult,
} from '@services/autotagger'
import { runAutotagger, type AutotaggerDeps } from './run.mts'

type RssFeedItemAutotagRunResult = RssFeedItemAutotagResult & {
  skipped?: boolean
  error?: string
}

// The "enabled" kill-switch is a full stop for autotagger-attributed writes: both the LLM pass and
// the collaborative pass respect it (enrichExtraTopics is only wired when enabled). Category
// mapping (3a) is a separate queue/system-user path and is unaffected. Discoverability gates only
// the LLM pass -- a non-discoverable item with enabled: true still gets collaborative topics, since
// that pass doesn't depend on LLM-eligibility. A zero-topic LLM budget must also skip the LLM pass
// entirely -- otherwise every add-topic call is rejected after a paid run.
async function shouldRunLlmForRssFeedItem(rssFeedItemId: string): Promise<boolean> {
  const { enabled, rss_discoverable_llm_max_topics } = getAutotaggerPaidLimitsFields()
  return (
    enabled &&
    rss_discoverable_llm_max_topics > 0 &&
    (await isRssFeedItemFromDiscoverableSource(rssFeedItemId))
  )
}

// #8773 round-14 finding 2: shared by processAIAgentWorkerJob's spend-cap gate
// (backend/workers/ai-agents/workers/core.mts) so a daily-cap breach can tell an RSS item that
// would actually call OpenAI apart from one that would only run the spend-free collaborative-topic
// pass -- see AI_AGENT_JOB_PRODUCES_SPEND's autotagger-rss-feed-item comment
// (backend/queues/ai-agents/config.mts). Mirrors the same early-exit order
// runAutotaggerOnRssFeedItem uses below (idempotency, then LLM eligibility) so the two call sites
// never disagree about what will and won't reach callOpenAIAutotagger.
export async function wouldAutotagRssFeedItemCallOpenAI(rssFeedItemId: string): Promise<boolean> {
  if (await hasExistingRssFeedItemAutotagging(rssFeedItemId)) return false
  return shouldRunLlmForRssFeedItem(rssFeedItemId)
}

export async function runAutotaggerOnRssFeedItem(
  item: ViewRssFeedItem,
  deps?: AutotaggerDeps,
): Promise<RssFeedItemAutotagRunResult | null> {
  // Idempotency short-circuit before doing any config/discoverability work -- an already-processed
  // item should never re-run the (cheap but real) discoverability check, let alone the LLM.
  if (await hasExistingRssFeedItemAutotagging(item.id)) return null

  const {
    enabled,
    rss_discoverable_llm_max_topics,
    rss_collaborative_plus_max_topics,
    rss_collaborative_pro_max_topics,
  } = getAutotaggerPaidLimitsFields()
  const shouldRunLlm = await shouldRunLlmForRssFeedItem(item.id)

  return runAutotagger<ViewRssFeedItem, RssFeedItemAutotagResult>(
    item,
    {
      entityType: 'rss_feed_item',
      hasExisting: hasExistingRssFeedItemAutotagging,
      createContent: createRssFeedItemAutotagContent,
      searchSeededTopics: async (
        entityId: string,
        limit: number,
      ): Promise<{ id: string; name: string }[]> => {
        const [vectorTopics, feedTopics] = await Promise.all([
          searchTopicsByRssFeedItemEmbedding(entityId, limit),
          getRssFeedItemMappedTopics(entityId, limit),
        ])
        // Feed-declared categories first (they are explicitly tagged by the feed author);
        // vector-similarity hits fill in after. Dedup by id, cap at limit.
        const seen = new Set<string>()
        const combined: { id: string; name: string }[] = []
        for (const t of [...feedTopics, ...vectorTopics]) {
          if (!seen.has(t.id)) {
            seen.add(t.id)
            combined.push(t)
            if (combined.length >= limit) break
          }
        }
        return combined
      },
      insertResult: insertRssFeedItemAutotaggingResult,
      makeErrorResult: id => ({
        id: '',
        rss_feed_item_id: id,
        prompt_id: '',
        content_sha256: Buffer.alloc(32),
        topics_added: [],
        created_at: new Date(),
      }),
      enrichExtraTopics: enabled
        ? async entityId => {
            // Return value (the written relations) is discarded here -- callers that need it for
            // vote-stats wait synchronization use applyCollaborativeTopicRelations directly (see
            // @services/rss-feed-items/collaborative-topic-relations.test.mts).
            await applyCollaborativeTopicRelations(entityId, {
              plusLimit: rss_collaborative_plus_max_topics,
              proLimit: rss_collaborative_pro_max_topics,
            })
          }
        : undefined,
    },
    deps,
    { max_topics: rss_discoverable_llm_max_topics, shouldRunLlm },
  )
}
