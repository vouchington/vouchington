import { AsyncLocalStorage } from 'node:async_hooks'
import type { QueryInput, QueryValues } from './types.mts'

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
  handler: () => Promise<Result>,
): Promise<{ result: Result; queries: CapturedQuery[] }> {
  const bucket: CapturedQuery[] = []
  const result = await captureAudiences.run(bucket, handler)
  return {
    result,
    queries: bucket.map(query => ({ ...query, values: [...query.values] })),
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
