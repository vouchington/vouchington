import { computeAutotaggerReceiptDigest } from '@services/autotagger'
import { renderClassifierCandidateQuestion } from '@agents/classifiers/safe-content'
import type { NoulClassifierBinding, TopicClassifierCandidate } from '@agents/classifiers/types'
import type { ActiveClassifierConfiguration } from '@services/classifiers'
import type { AutotaggerClassifierDispatchInput } from './dispatch-classifier.mts'

// This dispatch path only ever builds topic candidates (never `StoryClassifierCandidate`), so its
// bindings are narrowed to that specific member of the `candidate` union rather than left at the
// wider `NoulClassifierBinding` type -- letting `binding.candidate.topicId` typecheck directly
// wherever a binding is read back, instead of relying on a same-value stand-in field plus a comment.
export type AutotaggerClassifierBinding = NoulClassifierBinding & {
  candidate: TopicClassifierCandidate
}

export type AutotaggerClassifierBindingsAndDigest = {
  bindings: readonly AutotaggerClassifierBinding[]
  digest: Buffer
}

/**
 * Builds the Noul bindings for `input.candidates` against `configuration`'s active prompt, and the
 * receipt digest they hash into -- split out of dispatch-classifier.mts to keep both files under
 * the repository's per-file line cap, and so a crash-recovery test can seed a real, matching
 * receipt + persisted decision (via `claimAutotaggerReceipt` and `persistClassifierDecision`) using
 * the exact same digest `dispatchAutotaggerClassifier` itself would compute, instead of re-deriving
 * this construction independently in the test and risking silent drift between the two.
 */
export async function buildAutotaggerClassifierBindingsAndDigest(
  configuration: Pick<
    ActiveClassifierConfiguration,
    'prompt' | 'classifierId' | 'promptVersionId' | 'modelProvider' | 'modelName'
  >,
  input: AutotaggerClassifierDispatchInput,
): Promise<AutotaggerClassifierBindingsAndDigest> {
  const bindings: AutotaggerClassifierBinding[] = await Promise.all(
    input.candidates.map(async candidate => ({
      type: 'noul' as const,
      questionId: candidate.topicId,
      question: await renderClassifierCandidateQuestion(configuration.prompt, candidate.name),
      candidate: {
        candidateKind: 'topic' as const,
        topicId: candidate.topicId,
        storedCandidateId: null,
      },
    })),
  )
  const digest = computeAutotaggerReceiptDigest({
    state: input.state,
    questions: bindings.map(binding => ({
      questionId: binding.questionId,
      question: binding.question,
      candidateId: binding.candidate.topicId,
    })),
    scopeCategory: 'global',
    scopeCommunityId: null,
    effectiveCap: input.maxCandidates,
    classifierId: configuration.classifierId,
    promptVersionId: configuration.promptVersionId,
    modelProvider: configuration.modelProvider,
    modelName: configuration.modelName,
  })
  return { bindings, digest }
}
