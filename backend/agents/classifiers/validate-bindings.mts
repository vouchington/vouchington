import type { ActiveClassifierConfiguration } from '@services/classifiers'
import { candidatesForBinding, classifierCandidateKey } from './bindings.mts'
import { assertChoiceBinding } from './validate-choice-binding.mts'
import {
  assertClassifierDecisionIds,
  assertConfigurationIdentity,
  assertSubjectAndScope,
} from './validate-decision-input.mts'
import type { ClassifierDecisionCandidate, ExecuteClassifierDecisionInput } from './types.mts'

export function assertBindingsMatchConfiguration(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  assertConfigurationIdentity(input, configuration)
  assertSubjectAndScope(input, configuration)
  assertBindingSet(input, configuration)
}

export { assertClassifierDecisionIds }

function assertBindingSet(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  const questionIds = new Set<string>()
  const candidateKeys = new Set<string>()
  const storedCandidateIds = new Set<string>()
  for (const binding of input.bindings) {
    if (binding.type !== configuration.primitive)
      throw new Error('Classifier decision cannot mix question primitives')
    if (binding.questionId.trim().length === 0 || binding.question.trim().length === 0)
      throw new Error('Classifier bindings require a question ID and question')
    if (questionIds.has(binding.questionId))
      throw new Error('Classifier decision cannot duplicate question IDs')
    questionIds.add(binding.questionId)
    for (const candidate of candidatesForBinding(binding)) {
      assertCandidateIdentity(candidate)
      if (candidate.candidateKind !== configuration.candidateKind)
        throw new Error('Classifier decision cannot mix candidate kinds')
      const key = classifierCandidateKey(candidate)
      if (candidateKeys.has(key))
        throw new Error('Classifier decision cannot duplicate concrete candidates')
      candidateKeys.add(key)
      if (candidate.storedCandidateId) {
        if (storedCandidateIds.has(candidate.storedCandidateId))
          throw new Error('Classifier decision cannot duplicate stored candidates')
        storedCandidateIds.add(candidate.storedCandidateId)
      }
    }
    if (binding.type === 'choice') assertChoiceBinding(binding)
  }
}

function assertCandidateIdentity(candidate: ClassifierDecisionCandidate): void {
  const entityId = candidate.candidateKind === 'topic' ? candidate.topicId : candidate.storyId
  if (entityId.trim().length === 0)
    throw new Error('Classifier candidates require a concrete entity ID')
  if (candidate.storedCandidateId !== null && candidate.storedCandidateId.trim().length === 0)
    throw new Error('Stored classifier candidate IDs cannot be empty')
}
