import { vi, type Mock } from 'vitest'
import type {
  createStructuredDecisionClient,
  StructuredDecisionClient,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'

export type FakeStoryClusteringAnswer = {
  /**
   * The winning Choice criterion key -- `STORY_CLUSTERING_NONE_KEY`, or a candidate's own
   * `classifierChoiceKey(classifierCandidateKey(...))` (`choice-clustering-bindings.mts`). Must be
   * one of the dispatched request's own criteria; the fake throws otherwise rather than silently
   * answering something the real provider never could.
   */
  choice: string
  /** Probability assigned to `choice`. Defaults to 0.9, comfortably above the seeded classifier's
   * 0.6500 lower threshold (0730-00-02-seed-story-clustering-classifier.mts) so a non-`none`
   * choice reliably clears. */
  confidence?: number
}

export type FakeStructuredDecisionClient = {
  client: StructuredDecisionClient
  createClient: Mock<typeof createStructuredDecisionClient>
  decide: Mock<StructuredDecisionClient['decide']>
}

/**
 * Builds a fake `StructuredDecisionClient` for `choice-clustering.mts`'s single-question Choice
 * dispatch. Unlike autotagger's Noul fake
 * (`test-helpers/agents/autotagger/fake-structured-decision-client.mts`), which is handed the
 * candidate/probability map up front, a Choice question carries its own criteria on the request
 * (`ChoiceQuestion.criteria`), so this fake reads them off the request at `decide()` time instead
 * of requiring the caller to know the dispatched criterion keys in advance. The remaining
 * probability mass is split evenly across every other criterion so `probabilities` always sums to
 * 1 across the full criteria set, including the unbound `none` key, matching what
 * `answer-decoder.mts` requires of a real provider response.
 *
 * `decide` is a `vi.fn` so tests can assert call counts (idempotent replay) and inspect each
 * call's exact request (dispatched criteria, state content).
 */
export function createFakeStoryClusteringStructuredDecisionClient(
  answer: FakeStoryClusteringAnswer,
): FakeStructuredDecisionClient {
  const decide = vi.fn<StructuredDecisionClient['decide']>(
    async (request: StructuredDecisionRequest): Promise<StructuredDecisionResult> => ({
      answers: request.questions.map(question => {
        if (question.type !== 'choice')
          throw new Error('Story clustering fake client only answers Choice questions')
        if (!question.criteria.includes(answer.choice))
          throw new Error(`Fake answer's choice '${answer.choice}' is not a requested criterion`)
        const confidence = answer.confidence ?? 0.9
        const others = question.criteria.filter(criterion => criterion !== answer.choice)
        const remainder = others.length > 0 ? (1 - confidence) / others.length : 0
        const probabilities = Object.fromEntries(
          question.criteria.map(criterion => [
            criterion,
            criterion === answer.choice ? confidence : remainder,
          ]),
        )
        return {
          id: question.id,
          type: 'choice' as const,
          choice: answer.choice,
          confidence,
          probabilities,
          raw: {},
        }
      }),
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
