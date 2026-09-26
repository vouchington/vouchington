import { vi, type Mock } from 'vitest'
import type {
  createStructuredDecisionClient,
  StructuredDecisionClient,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'

/** Probability to answer for a Noul question, keyed by question id (== candidate topic id). */
export type FakeStructuredDecisionProbabilities = Readonly<Record<string, number>>

export type FakeStructuredDecisionClient = {
  client: StructuredDecisionClient
  createClient: Mock<typeof createStructuredDecisionClient>
  decide: Mock<StructuredDecisionClient['decide']>
}

/**
 * Builds a fake `StructuredDecisionClient` (plus the `createClient` factory
 * `dispatch-classifier.mts`'s `AutotaggerClassifierDispatchDeps` expects) for the three C6
 * autotagger dispatch test files. Answers every requested Noul question with the probability from
 * `probabilities`, keyed by question id, defaulting to a mid-range neutral 0.4 for any id the
 * caller didn't anticipate -- this dispatch path only ever sends Noul questions.
 *
 * Answering by id rather than a fixed-position list matters on the shared, parallel-running test
 * database: embedding-similarity candidate search (`run.test.mts` / `run-rss-feed-item.test.mts`)
 * can surface topics from other concurrently running tests, and this still produces a complete,
 * valid answer set for whatever candidate set actually got dispatched instead of failing
 * `resultsForShard`'s exact-coverage check.
 *
 * `decide` is a `vi.fn` so tests can assert call counts (idempotent replay, retry-after-failure)
 * and inspect each call's exact request (candidate coverage, feed-mapped-topic ordering, dedup).
 */
export function createFakeStructuredDecisionClient(
  probabilities: FakeStructuredDecisionProbabilities = {},
): FakeStructuredDecisionClient {
  const decide = vi.fn<StructuredDecisionClient['decide']>(
    async (request: StructuredDecisionRequest): Promise<StructuredDecisionResult> => ({
      answers: request.questions.map(question => ({
        id: question.id,
        type: 'noul' as const,
        probability: probabilities[question.id] ?? 0.4,
        raw: {},
      })),
      model: 'test-model',
      provider: 'test-provider',
      raw: {},
      usage: null,
    }),
  )
  const client: StructuredDecisionClient = { decide }
  const createClient = vi.fn<typeof createStructuredDecisionClient>(() => client)
  return { client, createClient, decide }
}
