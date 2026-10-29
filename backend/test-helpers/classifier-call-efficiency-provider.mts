import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { vi } from 'vitest'
import { fetchStructuredDecisionProvider } from '../modules/structured-decisions/transport.mts'
import {
  type AskedQuestion,
  decisionResponseBody,
  isOpenAIDecisionRequest,
  readAskedQuestions,
} from './structured-decision-dialect.mts'

/** A 503 is transient in every decision dialect, so the run retries without being billed. */
const UNAVAILABLE = { code: 503, message: 'No provider available' }

type ProviderOptions = {
  /** Signals the real provider boundary and waits for its explicit response release. */
  beforeResponse?: () => Promise<void>
  /** The probability the model gives a yes/no question (default 0.9, which every scope acts on). */
  noul?: (questionId: string) => number
}

/** The deterministic provider every call-efficiency scenario asks, and what it was asked. */
export type EfficiencyProvider = {
  /** The question ids of every request that reached the provider, refused ones included. */
  requests: string[][]
  /** The response ids of the requests it billed, for asserting provider calls. */
  billedResponseIds: string[]
  /** Refuses the next `count` requests like a provider outage: transient, nothing is billed. */
  refuseNext(count: number): void
}

/** A choice question is answered with the first real candidate, or `none` when there is none. */
function answerFor(id: string, question: AskedQuestion, options: ProviderOptions) {
  if (question.type === 'noul') return { id, type: 'noul', noul: options.noul?.(id) ?? 0.9 }
  if (question.type !== 'choice') throw new Error(`Unexpected question type: ${question.type}`)
  const keys = Object.keys(question.criteria)
  const choice = keys.find(key => key !== 'none') ?? 'none'
  const rest = 0.1 / Math.max(keys.length - 1, 1)
  const probabilities = Object.fromEntries(keys.map(key => [key, key === choice ? 0.9 : rest]))
  return { id, type: 'choice', choice, confidence: 0.9, probabilities }
}

/**
 * Every answered request costs 0.002 dollars (2000 millionths), so cost is never zero and a second
 * bill would be visible in the ledger. Jev reports that cost; OpenAI is priced from its 20,000 input
 * tokens at luna's $0.10 per million, with no billed output.
 */
function billedUsage(init: Parameters<typeof fetchStructuredDecisionProvider>[1]) {
  if (isOpenAIDecisionRequest(init)) return { input_tokens: 20_000, output_tokens: 0 }
  return { input_tokens: 12, output_tokens: 3, cost: 0.002 }
}

/**
 * Replaces the mocked provider transport (the test file mocks the module) with a billing provider
 * whose every answered request bills `billedUsage`.
 */
export function installEfficiencyProvider(options: ProviderOptions = {}): EfficiencyProvider {
  const requests: string[][] = []
  const billedResponseIds: string[] = []
  let refusals = 0
  vi.mocked(fetchStructuredDecisionProvider).mockImplementation(async (_url, init) => {
    const questions = readAskedQuestions(init)
    requests.push(Object.keys(questions))
    if (refusals > 0) {
      refusals -= 1
      return Response.json({ error: UNAVAILABLE }, { status: 503 })
    }
    await options.beforeResponse?.()
    const id = `decision-${randomUUID()}`
    billedResponseIds.push(id)
    return Response.json(
      decisionResponseBody(init, {
        id,
        model: 'typesafe/jev-1.13-20260917',
        provider: 'TypeSafe',
        usage: billedUsage(init),
        answers: Object.entries(questions).map(([qid, question]) =>
          answerFor(qid, question, options),
        ),
      }),
    )
  })
  return {
    requests,
    billedResponseIds,
    refuseNext(count) {
      refusals = count
    },
  }
}
