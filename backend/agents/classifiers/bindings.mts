import type {
  ChoiceQuestion,
  NoulQuestion,
  StructuredDecisionQuestion,
} from '@modules/structured-decisions'
import type { ClassifierDecisionCandidate, ClassifierQuestionBinding } from './types.mts'

export function toClassifierQuestions(
  bindings: readonly ClassifierQuestionBinding[],
): readonly StructuredDecisionQuestion[] {
  return bindings.map(binding =>
    binding.type === 'noul'
      ? ({
          id: binding.questionId,
          type: 'noul',
          question: binding.question,
        } satisfies NoulQuestion)
      : ({
          id: binding.questionId,
          type: 'choice',
          question: binding.question,
          criteria: binding.criteria.map(criterion => criterion.criterion),
        } satisfies ChoiceQuestion),
  )
}

export function candidatesForBinding(
  binding: ClassifierQuestionBinding,
): readonly ClassifierDecisionCandidate[] {
  return binding.type === 'noul'
    ? [binding.candidate]
    : binding.criteria.flatMap(criterion => (criterion.candidate ? [criterion.candidate] : []))
}

export function classifierCandidateEntityId(candidate: ClassifierDecisionCandidate): string {
  switch (candidate.candidateKind) {
    case 'topic':
      return candidate.topicId
    case 'story':
      return candidate.storyId
    case 'rss_feed_item':
      return candidate.rssFeedItemId
    default: {
      const exhaustive: never = candidate
      throw new Error(`Unhandled classifier candidate kind: ${String(exhaustive)}`)
    }
  }
}

export function classifierCandidateKey(candidate: ClassifierDecisionCandidate): string {
  return `${candidate.candidateKind}:${classifierCandidateEntityId(candidate)}`
}
