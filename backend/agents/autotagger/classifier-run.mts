import {
  executeClassifierRun,
  type ClassifierRunExecution,
  type ClassifierRunProviderHooks,
} from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { AutotaggerRunAdapter, AutotaggerRunConfiguration } from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { buildPostClassifierState, buildRssFeedItemClassifierState } from './content.mts'
import { buildAutotaggerRunInput } from './classifier-run-input.mts'

type SubjectState = () => Promise<ClassifierSafeText>

/** The subject at the content the receipt is keyed on; null when it is gone or has moved on. */
async function loadSubjectState(
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
): Promise<SubjectState | null> {
  const { postId, rssFeedItemId } = lease.subject
  if (postId !== null) {
    const post = await getPostByAny(postId, { readOnly: false })
    if (!post) return null
    if (!createPostModerationContent(post).content_sha256.equals(lease.inputSha256)) return null
    return () => buildPostClassifierState(post)
  }
  const item = await getRssFeedItemById(rssFeedItemId, { readOnly: false })
  if (!item) return null
  if (!createRssFeedItemEmbeddingContent(item.data).content_sha256.equals(lease.inputSha256)) {
    return null
  }
  return () => buildRssFeedItemClassifierState(item)
}

/**
 * Runs one leased C6 run. The shared classifier-run lifecycle reserves and caps the provider
 * attempt, records terminal failures and persists outcomes; this only builds the question set from
 * the run's captured topics and hands the subject's content to the shared executor.
 */
export async function executeAutotaggerRun(
  input: {
    adapter: AutotaggerRunAdapter
    lease: ClassifierRunLease<AutotaggerRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    createClient: (
      hooks: ClassifierRunProviderHooks,
      lease: ClassifierRunLease<AutotaggerRunConfiguration>,
    ) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  const { adapter, lease } = input
  const buildState = await loadSubjectState(lease)
  if (!buildState) return 'stale'
  return executeClassifierRun(
    adapter,
    { lease, maxAttempts: input.maxAttempts, signal: input.signal },
    {
      buildRemoteInput: async currentLease =>
        buildAutotaggerRunInput(currentLease, await buildState()),
      createClient: hooks => dependencies.createClient(hooks, lease),
    },
  )
}
