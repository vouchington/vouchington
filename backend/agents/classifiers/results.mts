import type {
  ChoiceAnswer,
  NoulAnswer,
  StructuredDecisionAnswer,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'
import {
  classifierDecisionResultKey,
  type ClassifierDecisionInputResult,
  type PersistClassifierDecisionCall,
} from '@services/classifiers'
import { candidatesForBinding, classifierCandidateKey } from './bindings.mts'
import type {
  ChoiceClassifierBinding,
  ClassifierDecisionCandidate,
  ClassifierQuestionBinding,
  NoulClassifierBinding,
} from './types.mts'

export function resultsForShard(
  request: StructuredDecisionRequest,
  response: StructuredDecisionResult,
  bindings: readonly ClassifierQuestionBinding[],
): readonly ClassifierDecisionInputResult[] {
  const bindingsByQuestionId = new Map(bindings.map(binding => [binding.questionId, binding]))
  const answersById = new Map<string, StructuredDecisionAnswer>()
  if (response.answers.length !== request.questions.length)
    throw new Error('Structured-decision shard did not cover every requested question')
  for (const answer of response.answers) {
    if (answersById.has(answer.id))
      throw new Error('Structured-decision shard returned duplicate answer IDs')
    answersById.set(answer.id, answer)
  }
  const results: ClassifierDecisionInputResult[] = []
  for (const question of request.questions) {
    const binding = bindingsByQuestionId.get(question.id)
    const answer = answersById.get(question.id)
    if (!binding || !answer)
      throw new Error('Structured-decision shard returned an unknown or missing answer')
    if (binding.type === 'noul') results.push(noulResult(binding, answer))
    else results.push(...choiceResults(binding, answer))
  }
  return results
}

export function assertCompleteCandidateCoverage(
  bindings: readonly ClassifierQuestionBinding[],
  calls: readonly PersistClassifierDecisionCall[],
): void {
  const expected = new Set<string>()
  for (const binding of bindings) {
    for (const candidate of candidatesForBinding(binding))
      expected.add(classifierCandidateKey(candidate))
  }
  const actual = new Set<string>()
  for (const call of calls) {
    for (const result of call.results) {
      const key = classifierDecisionResultKey(result)
      if (actual.has(key) || !expected.has(key))
        throw new Error('Classifier decision did not produce exact candidate coverage')
      actual.add(key)
    }
  }
  if (actual.size !== expected.size)
    throw new Error('Classifier decision did not produce exact candidate coverage')
}

function noulResult(
  binding: NoulClassifierBinding,
  answer: StructuredDecisionAnswer,
): ClassifierDecisionInputResult {
  if (answer.type !== 'noul')
    throw new Error('Structured-decision answer primitive does not match Noul binding')
  return resultForCandidate(binding.candidate, answer.probability, answer.raw)
}

function choiceResults(
  binding: ChoiceClassifierBinding,
  answer: StructuredDecisionAnswer,
): readonly ClassifierDecisionInputResult[] {
  if (answer.type !== 'choice')
    throw new Error('Structured-decision answer primitive does not match Choice binding')
  const results: ClassifierDecisionInputResult[] = []
  for (const criterion of binding.criteria) {
    if (!criterion.candidate) continue
    const probability = answer.probabilities[criterion.criterion]
    if (probability === undefined)
      throw new Error('Structured-decision Choice answer omitted a bound criterion probability')
    results.push(resultForCandidate(criterion.candidate, probability, answer.raw))
  }
  return results
}

function resultForCandidate(
  candidate: ClassifierDecisionCandidate,
  probability: number,
  rawResponse: NoulAnswer['raw'] | ChoiceAnswer['raw'],
): ClassifierDecisionInputResult {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error('Structured-decision answer produced an invalid probability')
  switch (candidate.candidateKind) {
    case 'topic':
      return {
        candidateKind: 'topic',
        topicId: candidate.topicId,
        storedCandidateId: candidate.storedCandidateId,
        probability,
        rawResponse,
      }
    case 'story':
      return {
        candidateKind: 'story',
        storyId: candidate.storyId,
        storedCandidateId: candidate.storedCandidateId,
        probability,
        rawResponse,
      }
    case 'rss_feed_item':
      return {
        candidateKind: 'rss_feed_item',
        rssFeedItemId: candidate.rssFeedItemId,
        storedCandidateId: candidate.storedCandidateId,
        probability,
        rawResponse,
      }
    default: {
      const exhaustive: never = candidate
      throw new Error(`Unhandled classifier candidate kind: ${String(exhaustive)}`)
    }
  }
}
