import { randomUUID } from 'node:crypto'
import { Response } from 'undici'

type AnswerOptions = {
  /** Prompt ids the model answers "yes, this post breaks the rule" to. */
  flagged?: ReadonlySet<string>
  /** Prompt ids left out of the response, as a partial decision would. */
  omit?: ReadonlySet<string>
  /** Answers for ids that were never asked, as a mismatched decision would. */
  extraIds?: readonly string[]
  /** Receives every question set the provider was asked, in call order. */
  asked?: string[][]
  /** Answers every asked id with this probability, ignoring `flagged`. */
  probability?: number
  /** The provider's decision id, so a test can find the ledger row this response was billed to. */
  responseId?: string
}

/** The questions a structured-decision provider request carries, keyed by prompt id. */
export function readAskedQuestions(init: RequestInit | undefined): Record<string, unknown> {
  const body = init?.body
  if (typeof body !== 'string') throw new Error('Expected a JSON string provider request body')
  return (JSON.parse(body) as { questions: Record<string, unknown> }).questions
}

/** A provider response that answers the community's rules one noul answer per asked question. */
export function answerCommunityQuestions(
  init: RequestInit | undefined,
  options: AnswerOptions = {},
): Response {
  const ids = Object.keys(readAskedQuestions(init))
  options.asked?.push(ids)
  const answered = [...ids.filter(id => !options.omit?.has(id)), ...(options.extraIds ?? [])]
  return Response.json({
    id: options.responseId ?? `decision-${randomUUID()}`,
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
    answers: answered.map(id => ({
      id,
      type: 'noul',
      noul: options.probability ?? (options.flagged?.has(id) ? 0.97 : 0.01),
    })),
  })
}

/**
 * A provider call that never answers until its signal aborts, as a stalled connection would. Every
 * signal it was given is appended to `signals`, so a test can tell which calls were cancelled.
 */
export function stallUntilAborted(
  signals: AbortSignal[] = [],
): (url: unknown, init?: RequestInit) => Promise<Response> {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) throw new Error('Expected the provider request to carry an abort signal')
      signals.push(signal)
      signal.addEventListener(
        'abort',
        () =>
          reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason))),
        { once: true },
      )
    })
}
