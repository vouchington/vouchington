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

export function maybeCaptureQuery(input: QueryInput, values?: QueryValues): void {
  if (!captureEnabled) return
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

  captured.push({
    text,
    values: resolvedValues,
    timestamp: Date.now(),
  })
}
