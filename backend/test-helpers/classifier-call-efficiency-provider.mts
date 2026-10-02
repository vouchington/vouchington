import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { vi } from 'vitest'
import { fetchStructuredDecisionProvider } from '../modules/structured-decisions/transport.mts'
import { OUTAGE } from './classifier-provider-failure-scenarios.mts'
import { readAskedQuestions } from './data-stores/psql/classifier-runs/community-moderation-provider.mts'

type Question = { type: string; criteria: Record<string, string> }

type ProviderOptions = {
  /** Moves the faked clock while the provider "answers", so the measured latency is this long. */
  latencyMs?: number
  /** The probability the model gives a yes/no question (default 0.9, which every scope acts on). */
  noul?: (questionId: string) => number
}

/** The deterministic provider every call-efficiency scenario asks, and what it was asked. */
export type EfficiencyProvider = {
  /** The question ids of every request that reached the provider, refused ones included. */
  requests: string[][]
  /** The response ids of the requests it billed (the ledger's idempotency keys). */
  billedResponseIds: string[]
  /** Refuses the next `count` requests like a provider outage: transient, nothing is billed. */
  refuseNext(count: number): void
}

/** A choice question is answered with the first real candidate, or `none` when there is none. */
function answerFor(id: string, question: Question, options: ProviderOptions) {
  if (question.type === 'noul') return { id, type: 'noul', noul: options.noul?.(id) ?? 0.9 }
  if (question.type !== 'choice') throw new Error(`Unexpected question type: ${question.type}`)
  const keys = Object.keys(question.criteria)
  const choice = keys.find(key => key !== 'none') ?? 'none'
  const rest = 0.1 / Math.max(keys.length - 1, 1)
  const probabilities = Object.fromEntries(keys.map(key => [key, key === choice ? 0.9 : rest]))
  return { id, type: 'choice', choice, confidence: 0.9, probabilities }
}

/**
 * Replaces the mocked provider transport (the test file mocks the module) with a billing provider:
 * every answered request reports 12 input tokens, 3 output tokens and 0.002 dollars (2000
 * millionths), so cost is never zero and a second bill would be visible in the ledger.
 */
export function installEfficiencyProvider(options: ProviderOptions = {}): EfficiencyProvider {
  const requests: string[][] = []
  const billedResponseIds: string[] = []
  let refusals = 0
  vi.mocked(fetchStructuredDecisionProvider).mockImplementation(async (_url, init) => {
    const questions = readAskedQuestions(init) as Record<string, Question>
    requests.push(Object.keys(questions))
    if (refusals > 0) {
      refusals -= 1
      return Response.json({ error: OUTAGE }, { status: 403 })
    }
    if (options.latencyMs) vi.setSystemTime(Date.now() + options.latencyMs)
    const id = `decision-${randomUUID()}`
    billedResponseIds.push(id)
    return Response.json({
      id,
      model: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      usage: { input_tokens: 12, output_tokens: 3, cost: 0.002 },
      answers: Object.entries(questions).map(([qid, question]) =>
        answerFor(qid, question, options),
      ),
    })
  })
  return {
    requests,
    billedResponseIds,
    refuseNext(count) {
      refusals = count
    },
  }
}
