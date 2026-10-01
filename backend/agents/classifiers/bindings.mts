import type {
  ChoiceQuestion,
  NoulQuestion,
  StructuredDecisionQuestion,
} from '@modules/structured-decisions'
import type { ClassifierDecisionInputResult } from '@services/classifiers'
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

/** The concrete entity a candidate or its result names, whichever kind it is. */
export function classifierCandidateEntityId(
  candidate: ClassifierDecisionCandidate | ClassifierDecisionInputResult,
): string {
  switch (candidate.candidateKind) {
    case 'topic':
      return candidate.topicId
    case 'story':
      return candidate.storyId
    case 'community_prompt':
      return candidate.communityPromptId
  }
}

export function classifierCandidateKey(
  candidate: ClassifierDecisionCandidate | ClassifierDecisionInputResult,
): string {
  return `${candidate.candidateKind}:${classifierCandidateEntityId(candidate)}`
}
