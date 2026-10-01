import { prepareSingleCallClassifierDecision } from '@agents/classifiers/prepare-single-call'
import type { PersistClassifierDecisionInput } from '@services/classifiers'
import {
  StructuredDecisionError,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'
import { recordPostClassifierReceiptAlarm } from '@modules/on-error'
import { createPostModerationContent } from '@services/posts/content'
import { persistPostClassifierOutcomes } from '@services/post-classifier/application-outcomes'
import type { PostClassifierLocalOutcome } from '@services/post-classifier/application-local-outcome'
import { readPostClassifierOutcomes } from '@services/post-classifier/application-read'
import {
  releasePostClassifierAdmissionLease,
  startPostClassifierProviderAttempt,
  failPostClassifierClientUnavailable,
  failPostClassifierRemoteAttempt,
} from '@services/post-classifier/application-attempt'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import type { PostClassifierApplicationLease } from '@services/post-classifier/application-identity'
import type { AiGeneratedModerationResult as AiGeneratedClassifierResult } from '@services/moderation/results'
import { buildPostClassifierInput } from './classifier-input.mts'

type AttemptHooks = { beforeAttempt: () => Promise<void> }

class AttemptStopped extends Error {
  readonly outcome: 'stale' | 'replay' | 'terminal'
  constructor(outcome: 'stale' | 'replay' | 'terminal') {
    super(`post classifier provider attempt did not start: ${outcome}`)
    this.outcome = outcome
  }
}

export async function executePostClassifierOutcomes(
  input: {
    post: Parameters<typeof buildPostClassifierInput>[0]
    lease: PostClassifierApplicationLease
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    detectLocal: (
      text: string,
      options: { confidenceThreshold: number },
    ) => Promise<AiGeneratedClassifierResult>
    createClient: (hooks: AttemptHooks) => StructuredDecisionClient
  },
): Promise<'persisted' | 'replay' | 'stale' | 'terminal'> {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0)
    throw new Error('post classifier provider attempt limit must be positive')
  if (input.post.id !== input.lease.postId) return 'stale'
  const content = createPostModerationContent(input.post)
  if (!content.content_sha256.equals(input.lease.inputSha256)) return 'stale'
  if (await readPostClassifierOutcomes(input.lease)) return 'replay'
  const classifierInput = await buildPostClassifierInput(
    input.post,
    input.lease.resolved.configuration,
  )

  const local = input.lease.resolved.configuration.local
  input.signal.throwIfAborted()
  const detected = local
    ? await dependencies.detectLocal(
        [content.title, content.markdown].filter(Boolean).join('\n\n'),
        {
          confidenceThreshold: local.confidenceThreshold,
        },
      )
    : undefined
  const localOutcome: PostClassifierLocalOutcome | undefined = detected && {
    flagged: detected.flagged,
    reason: detected.reason,
    confidenceScore: detected.confidence_score,
    confidenceThreshold: detected.confidence_threshold,
    classification: detected.classification,
    detector: detected.detector,
    detectorModelVersion: detected.detector_model_version,
  }
  input.signal.throwIfAborted()
  let remoteDecision: PersistClassifierDecisionInput | undefined
  if (classifierInput) {
    if (!input.lease.decisionBatchId)
      throw new Error('Remote post classifier requires a pre-reserved decision batch')
    const phase = { reserved: false, returned: false }
    let baseClient: StructuredDecisionClient
    try {
      baseClient = dependencies.createClient({
        beforeAttempt: async () => {
          const attempt = await startPostClassifierProviderAttempt({
            ...input.lease,
            maxAttempts: input.maxAttempts,
          })
          if (attempt === 'no_remote')
            throw new Error('Remote post classifier receipt has no remote work')
          if (attempt !== 'started') throw new AttemptStopped(attempt)
          phase.reserved = true
        },
      })
    } catch (error) {
      // A client that cannot be built (missing credentials) fails identically on every retry, so it
      // ends the remote half through the recorded path instead of looping the sweep.
      const failure = await failPostClassifierClientUnavailable({ ...input.lease, localOutcome })
      if (failure === 'terminal') {
        recordPostClassifierReceiptAlarm({
          kind: 'client-unavailable',
          postId: input.lease.postId,
          applicationId: input.lease.applicationId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        })
      }
      return failure
    }
    try {
      remoteDecision = await prepareSingleCallClassifierDecision({
        ...classifierInput,
        batchId: input.lease.decisionBatchId,
        client: {
          decide: async (request, signal) => {
            const response = await baseClient.decide(request, signal)
            phase.returned = true
            return response
          },
        },
        signal: input.signal,
      })
      input.signal.throwIfAborted()
    } catch (error) {
      if (error instanceof AttemptStopped) return error.outcome
      if (!phase.reserved && error instanceof OpenAiSpendCapBreachError) {
        await releasePostClassifierAdmissionLease(input.lease)
      }
      const failureKind = !phase.reserved
        ? null
        : error instanceof StructuredDecisionError && error.code === 'invalid-response'
          ? 'invalid-result'
          : (error instanceof StructuredDecisionError && error.code === 'provider-error') ||
              input.signal.aborted
            ? 'provider-error'
            : phase.returned
              ? 'invalid-result'
              : null
      if (failureKind) {
        const failure = await failPostClassifierRemoteAttempt({
          ...input.lease,
          maxAttempts: input.maxAttempts,
          failureKind,
        })
        if (failure !== 'released') return failure
      }
      throw error
    }
    if (!phase.reserved) throw new Error('Post classifier client skipped its provider attempt hook')
  }
  const outcome = await persistPostClassifierOutcomes({
    lease: input.lease,
    localOutcome,
    remoteDecision,
  })
  return outcome
}
