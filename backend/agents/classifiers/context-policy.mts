import type { StructuredDecisionRequest } from '@modules/structured-decisions'
import type { ClassifierContextPolicy } from './types.mts'

const TYPESAFE_TOTAL_TOKEN_LIMIT = 64_000
const TYPESAFE_STATE_AND_LONGEST_QUESTION_TOKEN_LIMIT = 32_000
const OPENROUTER_TOTAL_TOKEN_LIMIT = 32_000

export function requestFitsClassifierContext(
  request: StructuredDecisionRequest,
  policy: ClassifierContextPolicy,
): boolean {
  if (policy.transport === 'openrouter') {
    const measurement = policy.measure(request)
    assertTokenCount(measurement.totalTokens, 'totalTokens')
    return measurement.totalTokens <= OPENROUTER_TOTAL_TOKEN_LIMIT
  }
  const measurement = policy.measure(request)
  assertTokenCount(measurement.totalTokens, 'totalTokens')
  assertTokenCount(measurement.stateAndLongestQuestionTokens, 'stateAndLongestQuestionTokens')
  return (
    measurement.totalTokens <= TYPESAFE_TOTAL_TOKEN_LIMIT &&
    measurement.stateAndLongestQuestionTokens <= TYPESAFE_STATE_AND_LONGEST_QUESTION_TOKEN_LIMIT
  )
}

export function assertClassifierContextPolicy(policy: ClassifierContextPolicy): void {
  if (policy.model.trim().length === 0)
    throw new Error('Classifier context policy requires a model')
  if (typeof policy.measure !== 'function')
    throw new Error('Classifier context policy requires an exact request measurer')
}

function assertTokenCount(value: number, metric: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`Classifier context measurer returned an invalid ${metric}`)
}
