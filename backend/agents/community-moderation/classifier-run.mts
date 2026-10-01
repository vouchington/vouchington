import {
  executeClassifierRun,
  type ClassifierRunExecution,
  type ClassifierRunProviderHooks,
} from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierRunLease } from '@services/classifier-runs'
import type {
  CommunityModerationRunAdapter,
  CommunityModerationRunConfiguration,
} from '@services/community-agent-prompts'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { buildCommunityModerationRunInput } from './classifier-run-input.mts'
import { buildCommunityModerationState } from './classifier-run-state.mts'

type Lease = ClassifierRunLease<CommunityModerationRunConfiguration>

/** The post at the content the receipt is keyed on; null when it is gone or has moved on. */
async function loadSubjectState(lease: Lease): Promise<(() => Promise<ClassifierSafeText>) | null> {
  const { postId } = lease.subject
  if (postId === null) throw new Error('community moderation run subject must be a post')
  const post = await getPostByAny(postId, { readOnly: false })
  if (!post) return null
  if (!createPostModerationContent(post).content_sha256.equals(lease.inputSha256)) return null
  return () => buildCommunityModerationState(post)
}

/**
 * Runs one leased C8 run. The shared classifier-run lifecycle reserves and caps the provider
 * attempt, records terminal failures and persists outcomes; this only builds the single call that
 * asks every pinned community rule over the post's content.
 */
export async function executeCommunityModerationRun(
  input: {
    adapter: CommunityModerationRunAdapter
    lease: Lease
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    createClient: (hooks: ClassifierRunProviderHooks, lease: Lease) => StructuredDecisionClient
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
        buildCommunityModerationRunInput(currentLease, await buildState()),
      createClient: hooks => dependencies.createClient(hooks, lease),
    },
  )
}
