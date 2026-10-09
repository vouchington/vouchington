import { AsyncLocalStorage } from 'node:async_hooks'
import {
  summarizeRequestQueries,
  type RequestQuery,
  type RequestQuerySummary,
} from './request-query-profile-summary.mts'

// Audience of one request. Only a harness that calls `createRequestQueryProfile().run` activates
// it, so production never has a store and `recordRequestQueryTiming` returns on its first line.
const requestProfiles = new AsyncLocalStorage<RequestQuery[]>()

export interface RequestQueryProfile {
  /** Run `handler` so every query it (and its async descendants) issues is attributed here. */
  run: <Result>(handler: () => Result) => Result
  /** Snapshot of queries recorded so far; queries finishing after this call are not included. */
  summarize: () => RequestQuerySummary
}

/** @public used by the API test server in backend/test-helpers, which production analysis ignores */
export function createRequestQueryProfile(): RequestQueryProfile {
  const queries: RequestQuery[] = []
  return {
    run: handler => requestProfiles.run(queries, handler),
    summarize: () => summarizeRequestQueries(queries),
  }
}

/** The `QueryTimingInput` fields used here (structural, so telemetry can import this module). */
interface RequestQueryTimingInput {
  annotation: string | null
  durationMs: number
  cursorBatches?: number
  pipelined?: boolean
}

/** Fed from the query-timing hook, which fires for every query including in-transaction ones. */
export function recordRequestQueryTiming(input: RequestQueryTimingInput): void {
  const queries = requestProfiles.getStore()
  if (!queries) return
  const endMs = performance.now()
  queries.push({
    annotation: input.annotation,
    startMs: endMs - input.durationMs,
    endMs,
    excludedFromRepeats: input.cursorBatches !== undefined || input.pipelined === true,
  })
}
