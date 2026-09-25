import type { Post } from '@services/posts/types'
import { buildPostClassifierState } from './content.mts'
import { searchTopicsByPostEmbedding } from '@services/topics/tools/by-post-embedding'
import {
  dispatchAutotaggerClassifier,
  type AutotaggerClassifierDispatchDeps,
} from './dispatch-classifier.mts'

export type PostAutotagRunResult = { topics_added: readonly string[] }

// The only overridable seam is the provider boundary (AutotaggerClassifierDispatchDeps.createClient,
// dispatch-classifier.mts) -- per the repository's test-mocking rule, embedding search, state
// building, and dispatch itself always run for real, even in tests.
export type AutotaggerDeps = AutotaggerClassifierDispatchDeps

/**
 * C6 entry point for post autotagging: resolve embedding-similar topic candidates -- capped at the
 * caller-resolved tier budget (processAutotaggerPost resolves and forwards it as `max_topics`) --
 * build the post's classifier state, and dispatch through the shared receipt/classifier path
 * (dispatch-classifier.mts). Eligibility gating (enabled, tier-zero) lives entirely in the caller
 * (processAutotaggerPost); an empty candidate list here is a defensive no-op, not the gate itself.
 *
 * Any dispatch error (provider error, in-progress lease, invalid result) is left to propagate to
 * the caller: the ai-agents worker's own catch (backend/workers/ai-agents/workers/core.mts) is what
 * turns a thrown error into a BullMQ job failure/retry, exactly like every other agent job. This no
 * longer swallows errors into an `error` result field the way the old free-form tool-loop engine
 * did -- a stuck/expired receipt lease is cheap and safe to retry from scratch (see
 * dispatch-classifier.mts), unlike repeating an OpenAI agentic run.
 *
 * `max_topics` is required, not defaulted: it becomes the digest's `effectiveCap`
 * (dispatch-classifier.mts), so a silent fallback would silently pick a receipt identity for the
 * caller. The caller (processAutotaggerPost) must resolve and pass the author's tiered cap
 * explicitly. It comes before `deps` in the parameter list so `deps` -- the only parameter with a
 * default -- can stay last (oxlint's default-param-last rule).
 */
export async function runAutotaggerOnPost(
  post: Post,
  options: { max_topics: number },
  deps: AutotaggerDeps = {},
): Promise<PostAutotagRunResult | null> {
  const maxCandidates = options.max_topics
  if (maxCandidates === 0) return null

  const candidates = await searchTopicsByPostEmbedding(post.id, maxCandidates)
  if (candidates.length === 0) return null

  const state = await buildPostClassifierState(post)

  const result = await dispatchAutotaggerClassifier(
    {
      subject: { postId: post.id, rssFeedItemId: null },
      state,
      candidates: candidates.map(candidate => ({ topicId: candidate.id, name: candidate.name })),
      maxCandidates,
    },
    deps,
  )
  if (!result) return null
  return { topics_added: result.topicIds }
}
