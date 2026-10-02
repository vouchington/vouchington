import { vi, type Mock } from 'vitest'
import type {
  StructuredDecisionClient,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'

/** The lifecycle's provider hooks, structurally (the helpers workspace has no agent dependency). */
type ProviderHooks = { beforeAttempt: () => Promise<void> }

/** What the fake provider picks: a candidate, none of them, or exact per-criterion probabilities. */
export type FakeChoicePick =
  | { storyId: string }
  | { rssFeedItemId: string }
  | 'none'
  | { probabilities: Readonly<Record<string, number>> }

export type FakeChoiceClient = {
  decide: Mock<StructuredDecisionClient['decide']>
  /** Reserves the lifecycle's provider attempt before every request, as a real client does. */
  createClient: Mock<(hooks: ProviderHooks) => StructuredDecisionClient>
}

const CHOSEN = 0.9

function probabilitiesFor(
  criteria: readonly string[],
  pick: FakeChoicePick,
): Record<string, number> {
  const rest = criteria.length > 1 ? (1 - CHOSEN) / (criteria.length - 1) : 0
  if (typeof pick === 'object' && 'probabilities' in pick) {
    return Object.fromEntries(criteria.map(key => [key, pick.probabilities[key] ?? rest]))
  }
  let chosen = 'none'
  if (typeof pick === 'object') {
    chosen = 'storyId' in pick ? `story:${pick.storyId}` : `rss_feed_item:${pick.rssFeedItemId}`
  }
  return Object.fromEntries(criteria.map(key => [key, key === chosen ? CHOSEN : rest]))
}

function answerFor(
  request: StructuredDecisionRequest,
  pick: FakeChoicePick,
): StructuredDecisionResult {
  return {
    answers: request.questions.map(question => {
      if (question.type !== 'choice') throw new Error('The fake provider only answers Choice')
      const probabilities = probabilitiesFor(question.criteria, pick)
      const [choice, confidence] = Object.entries(probabilities).reduce((best, entry) =>
        entry[1] > best[1] ? entry : best,
      )
      return {
        id: question.id,
        type: 'choice' as const,
        choice,
        confidence,
        probabilities,
        raw: {},
      }
    }),
    model: 'test-model',
    provider: 'test-provider',
    raw: {},
    usage: null,
  }
}

/** A deterministic story-clustering provider; `decide` records every physical request. */
export function createFakeChoiceClient(pick: FakeChoicePick): FakeChoiceClient {
  const decide = vi.fn<StructuredDecisionClient['decide']>(async request =>
    answerFor(request, pick),
  )
  const createClient = vi.fn<(hooks: ProviderHooks) => StructuredDecisionClient>(hooks => ({
    decide: async (request, signal) => {
      await hooks.beforeAttempt()
      return decide(request, signal)
    },
  }))
  return { decide, createClient }
}
