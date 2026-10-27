import { expect } from 'vitest'
import { createStructuredDecisionClient } from '@modules/structured-decisions'
import {
  missingOrDuplicateClassifierGoldenResults,
  type ClassifierGoldenCase,
} from './classifier-golden-set.mts'
import {
  callWithDeadlineAndOneRetry,
  SMOKE_CALL_DEADLINE_MS,
  structuredDecisionClientWithSignal,
} from './provider-call-deadline.mts'

/**
 * Proves the live OpenRouter classifier path answers: one provider call through the case's
 * production prompt and bindings, judged on structure only (one result per candidate, each
 * probability a probability). Decision bands belong to the dispatch-only golden eval.
 */
export async function runClassifierSmokeCase(
  testCase: ClassifierGoldenCase,
): Promise<{ candidateId: string; probability: number }[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for this credentialed test.')
  const client = createStructuredDecisionClient({ transport: 'openrouter', apiKey })
  const results = await callWithDeadlineAndOneRetry(
    testCase.fixture.id,
    SMOKE_CALL_DEADLINE_MS,
    signal => testCase.decide(structuredDecisionClientWithSignal(client, signal)),
  )

  expect(
    missingOrDuplicateClassifierGoldenResults(
      testCase.fixture.id,
      Object.keys(testCase.candidates),
      results.map(result => result.candidateId),
    ),
  ).toEqual([])
  for (const { probability } of results) {
    expect(probability).toBeGreaterThanOrEqual(0)
    expect(probability).toBeLessThanOrEqual(1)
  }
  return [...results]
}
