import {
  executeClassifierRun,
  type ClassifierRunExecution,
  type ClassifierRunProviderHooks,
} from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierRunLease } from '@services/classifier-runs'
import type { AiGeneratedModerationResult } from '@services/moderation/results'
import type {
  PostClassifierConfiguration,
  PostClassifierLocalOutcome,
  PostClassifierRunAdapter,
} from '@services/post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import { buildPostClassifierInput } from './classifier-input.mts'

/**
 * Runs one leased C5 run. The shared classifier-run lifecycle reserves and caps the provider
 * attempt, records terminal failures and persists outcomes; this only builds C5's input and maps
 * the local detector result.
 */
export async function executePostClassifierRun(
  input: {
    adapter: PostClassifierRunAdapter
    post: Parameters<typeof buildPostClassifierInput>[0]
    lease: ClassifierRunLease<PostClassifierConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    detectLocal: (
      text: string,
      options: { confidenceThreshold: number },
    ) => Promise<AiGeneratedModerationResult>
    createClient: (hooks: ClassifierRunProviderHooks) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  const { adapter, post, lease } = input
  if (post.id !== lease.subject.postId) return 'stale'
  const content = createPostModerationContent(post)
  if (!content.content_sha256.equals(lease.inputSha256)) return 'stale'
  return executeClassifierRun(
    adapter,
    { lease, maxAttempts: input.maxAttempts, signal: input.signal },
    {
      buildRemoteInput: currentLease =>
        buildPostClassifierInput(post, currentLease.resolved.configuration),
      detectLocal: async currentLease => {
        const local = currentLease.resolved.configuration.local
        if (!local) return undefined
        const detected = await dependencies.detectLocal(
          [content.title, content.markdown].filter(Boolean).join('\n\n'),
          { confidenceThreshold: local.confidenceThreshold },
        )
        return {
          flagged: detected.flagged,
          reason: detected.reason,
          confidenceScore: detected.confidence_score,
          confidenceThreshold: detected.confidence_threshold,
          classification: detected.classification,
          detector: detected.detector,
          detectorModelVersion: detected.detector_model_version,
        } satisfies PostClassifierLocalOutcome
      },
      createClient: dependencies.createClient,
    },
  )
}
