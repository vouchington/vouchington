import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from '@services/classifiers'
import { createStructuredDecisionSpendHooks } from '@agents/_shared'
import { createStructuredDecisionClient } from '@modules/structured-decisions'
import { executeSingleCallClassifierDecision } from '@agents/classifiers/execute-single-call'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items'
import type { ClassifierModelProvider } from '@voucha/types'
import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'
import { dedupeStoryClusterCandidates } from './dedupe-candidates.mts'
import {
  buildStoryClusteringBindings,
  type StoryClusteringCandidateContent,
} from './choice-clustering-bindings.mts'
import {
  selectStoryClusteringOutcome,
  type StoryClusteringOutcome,
} from './choice-clustering-selection.mts'

const STORY_CLUSTERING_CLASSIFIER_SLUG = 'story-clustering-classifier'

// Distinct from the classifier slug above: this is the `ai_usage_records.agent_slug` spend
// attribution bucket (0730-00-02-seed-story-clustering-classifier.mts's own doc comment).
const STORY_CLUSTERING_SPEND_AGENT_SLUG = 'story-clustering'

// The ai-agents worker's shared job lock is 300s (workers/ai-agents/workers/core.mts's
// `lockDuration: 300_000`). This bounds a stalled provider call well under that, with generous
// headroom for everything else a story-clustering job does in the same lock -- there is no
// per-decision receipt/lease to size against here, unlike the tagging classifier's own dispatch
// bound (agents/autotagger/dispatch-classifier-execute.mts's `DISPATCH_TIMEOUT_MS`).
const DISPATCH_TIMEOUT_MS = 60_000

const NONE_OUTCOME: StoryClusteringOutcome = { kind: 'none' }

/**
 * Resolves the OpenRouter/Jev API key for a story-clustering dispatch. Duplicated from
 * `agents/autotagger/dispatch-classifier.mts`'s identical `resolveStructuredDecisionApiKey`
 * rather than shared -- both are single-provider, single-branch resolvers with nothing generic
 * to factor out yet; a third classifier family needing the same resolution is the trigger to
 * extract a shared helper, not this one. Exported for direct unit testing of both branches
 * without touching the real seeded `story-clustering-classifier` row.
 */
export function resolveStoryClusteringApiKey(transport: ClassifierModelProvider): string {
  if (transport === 'openrouter') return process.env.OPENROUTER_API_KEY ?? ''
  throw new Error(
    `Story clustering classifier dispatch has no API key source for provider '${transport}'`,
  )
}

export type StoryClusteringDispatchInput = {
  batchId: string
  incomingItemId: string
  /**
   * Lazily loads this decision's raw (un-deduped) candidate rows -- never called when a
   * committed decision already exists for `batchId`. A thunk, not a plain array, so a replay
   * never re-runs `findClusterCandidates` (`@services/stories/cluster-candidates.mts`), and so
   * this package never imports `@services/stories` itself, which already imports
   * `@agents/story-clustering` for dispatch (see `cluster-candidates.mts`'s own
   * cycle-avoidance comment on why `StoryClusterCandidateRow` lives in `@voucha/types` instead).
   */
  loadCandidates: () => Promise<readonly StoryClusterCandidateRow[]>
}

export type StoryClusteringDispatchDeps = {
  createClient?: typeof createStructuredDecisionClient
}

/**
 * Dispatches (or replays) the single Choice decision a story-clustering job ever makes for its
 * incoming item. Checks for an already-committed decision under `batchId` first, before ever
 * calling `loadCandidates` -- a retry after a partial failure (the decision persisted, but the
 * caller crashed before acting on the outcome) must recover that decision outright, never
 * re-dispatch, and never let a changed or emptied candidate search on retry silently discard a
 * decision that already exists.
 *
 * An empty (or fully-vanished-by-fetch-time) candidate set resolves to `{ kind: 'none' }` rather
 * than throwing or returning `null`: from the caller's (`@services/stories/cluster.mts`)
 * perspective, "nothing to choose between" and "the model chose none" both mean "take no
 * clustering action for this item."
 */
export async function dispatchStoryClusteringDecision(
  input: StoryClusteringDispatchInput,
  deps: StoryClusteringDispatchDeps = {},
): Promise<StoryClusteringOutcome> {
  const existing = await readCompleteClassifierDecisionIfExistsFromPrimary(input.batchId, 'story')
  if (existing) return selectStoryClusteringOutcome(existing.results)

  const rawCandidates = await input.loadCandidates()
  if (rawCandidates.length === 0) return NONE_OUTCOME
  const candidates = dedupeStoryClusterCandidates(rawCandidates)

  const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(
    STORY_CLUSTERING_CLASSIFIER_SLUG,
  )
  /* v8 ignore start -- only reachable if the 0730-00-02 seed is absent, or the
     story-clustering-classifier row was deliberately deactivated; every correctly migrated
     environment has an active row. */
  if (!configuration) {
    throw new Error(
      `Classifier configuration for slug '${STORY_CLUSTERING_CLASSIFIER_SLUG}' not found`,
    )
  }
  /* v8 ignore stop */

  const items = await getRssFeedItemsByIdBatch([
    input.incomingItemId,
    ...candidates.map(candidate => candidate.id),
  ])
  const [incomingItem, ...candidateItems] = items
  if (!incomingItem) return NONE_OUTCOME

  const candidateContent: StoryClusteringCandidateContent[] = candidates.flatMap(
    (candidate, index) => {
      const item = candidateItems[index]
      return item ? [{ candidate, item }] : []
    },
  )
  if (candidateContent.length === 0) return NONE_OUTCOME

  const { bindings, state } = await buildStoryClusteringBindings({
    incomingItem,
    candidateContent,
    promptTemplate: configuration.prompt,
  })

  const buildClient = deps.createClient ?? createStructuredDecisionClient
  const client = buildClient({
    transport: configuration.modelProvider,
    apiKey: resolveStoryClusteringApiKey(configuration.modelProvider),
    hooks: createStructuredDecisionSpendHooks(STORY_CLUSTERING_SPEND_AGENT_SLUG, {}),
  })

  const result = await executeSingleCallClassifierDecision({
    batchId: input.batchId,
    classifierId: configuration.classifierId,
    promptVersionId: configuration.promptVersionId,
    subject: { postId: null, rssFeedItemId: input.incomingItemId },
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    state,
    bindings,
    client,
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  })

  return selectStoryClusteringOutcome(result.decision.results)
}
