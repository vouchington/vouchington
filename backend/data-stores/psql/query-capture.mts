import { AsyncLocalStorage } from 'node:async_hooks'
import {
  observeQueryCompletion,
  reportQueryCaptureFailure,
  runWithQueryCompletionDiagnostics,
  type QueryCompletion,
} from './query-completion.mts'
export type { QueryCompletion } from './query-completion.mts'

import type { QueryExecutor, QueryInput, QueryValues } from './types.mts'
interface CapturedQuery {
  text: string
  values: readonly unknown[]
  timestamp: number
}
let captureEnabled = false
const captured: CapturedQuery[] = []
const queryCaptureScopes = new AsyncLocalStorage<{ captured: boolean }>()
// Plan tests share a fork with in-process workers. This audience records only the profiled call.
const captureAudiences = new AsyncLocalStorage<CapturedQuery[]>()
export function enableQueryCapture(): void {
  captureEnabled = true
  captured.length = 0
}
export function disableQueryCapture(): void {
  captureEnabled = false
}

export function getCapturedQueries(): CapturedQuery[] {
  return [...captured]
}

export function clearCapturedQueries(): void {
  captured.length = 0
}

export function runWithSingleQueryCapture<Result>(handler: () => Result): Result {
  return queryCaptureScopes.run({ captured: false }, handler)
}

export async function runWithCapturedQueries<Result>(
  handler: (context: {
    subscribe: (listener: (event: QueryCompletion) => undefined) => () => void
  }) => Promise<Result>,
) {
  const bucket: CapturedQuery[] = []
  const diagnostics = await runWithQueryCompletionDiagnostics(async context => {
    const result = await captureAudiences.run(bucket, () =>
      handler({ subscribe: context.subscribe }),
    )
    context.deactivate()
    const queries = bucket.flatMap(query => {
      try {
        return [{ ...query, values: [...query.values] }]
      } catch (err) {
        context.report(err)
        return []
      }
    })
    return { result, queries }
  })
  return {
    ...diagnostics.result,
    completedTransactions: diagnostics.completedTransactions,
    completionDrain: diagnostics.completionDrain,
  }
}

export function maybeCaptureQuery(input: QueryInput, values?: QueryValues): void {
  const audience = captureAudiences.getStore()
  if (!audience && !captureEnabled) return
  const scope = queryCaptureScopes.getStore()
  if (scope?.captured) return
  if (scope) scope.captured = true

  let text: string
  let resolvedValues: readonly unknown[] = []
  if (typeof input === 'string') {
    text = input
    resolvedValues = Array.isArray(values) ? values : []
  } else if ('text' in input && typeof input.text === 'string') {
    text = input.text
    resolvedValues = 'values' in input && Array.isArray(input.values) ? input.values : []
  } else {
    return
  }

  const record = {
    text,
    values: resolvedValues,
    timestamp: Date.now(),
  }
  if (audience) audience.push(record)
  else captured.push(record)
}

const captureAwareQueries = new WeakSet<QueryExecutor>()
/** The transaction adapter and its consumers share one capture/completion wrapper. */
export function captureTransactionQuery<Query extends QueryExecutor>(query: Query): Query {
  if (captureAwareQueries.has(query)) return query
  const capturedQuery = new Proxy(query, {
    apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      try {
        maybeCaptureQuery(argumentsList[0], argumentsList[1])
      } catch (err) {
        if (!reportQueryCaptureFailure(err)) throw err
      }
      const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArgument, argumentsList)
      observeQueryCompletion(target, argumentsList, pending)
      return pending
    },
  }) as Query
  captureAwareQueries.add(capturedQuery)
  return capturedQuery
}
