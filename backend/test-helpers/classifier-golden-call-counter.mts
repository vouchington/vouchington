import type { StructuredDecisionClient } from '@modules/structured-decisions'
import { structuredDecisionClientWithSignal } from './provider-call-deadline.mts'

export type CallCounter = { count: number }

/** The client a golden case decides with: every provider call is counted and bound to `signal`. */
export function countedClientWithSignal(
  client: StructuredDecisionClient,
  counter: CallCounter,
  signal: AbortSignal,
): StructuredDecisionClient {
  const bound = structuredDecisionClientWithSignal(client, signal)
  return {
    decide: (request, callerSignal) => {
      counter.count += 1
      return bound.decide(request, callerSignal)
    },
  }
}
