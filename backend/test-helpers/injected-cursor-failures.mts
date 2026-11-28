import { vi } from 'vitest'
import * as psql from '@data-stores/psql'

function spyCursorReads(
  marker: string,
  intercept: (values: readonly unknown[]) => AsyncIterable<unknown> | undefined,
): () => void {
  const realCursor = psql.psql.createAsyncGeneratorFromCursor
  const spy = vi
    .spyOn(psql.psql, 'createAsyncGeneratorFromCursor')
    .mockImplementation((input, values, options) => {
      const text = typeof input === 'string' ? input : input.text
      const boundValues = Array.isArray(values)
        ? values
        : typeof input === 'object' && 'values' in input && Array.isArray(input.values)
          ? input.values
          : []
      const intercepted = text.includes(marker) ? intercept(boundValues) : undefined
      return intercepted
        ? (intercepted as unknown as ReturnType<typeof realCursor>)
        : Reflect.apply(realCursor, psql.psql, [input, values, options])
    })
  return () => spy.mockRestore()
}

/** Reject matching cursor reads on the default pool; returns the restore. */
export function rejectCursorReadsForTest(
  marker: string,
  error: unknown,
  onRejected: (values: readonly unknown[]) => void,
  matchesValues: (values: readonly unknown[]) => boolean,
): () => void {
  return spyCursorReads(marker, values => {
    if (!matchesValues(values)) return undefined
    onRejected(values)
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<never>> {
            throw error
          },
          async return(): Promise<IteratorResult<never>> {
            return { done: true, value: undefined as never }
          },
        }
      },
    }
  })
}

/** Answer matching cursor reads in order; exhausted answers run for real. Returns the restore. */
export function answerCursorReadsForTest(
  marker: string,
  answers: ReadonlyArray<Record<string, unknown>[]>,
): () => void {
  let cursorCalls = 0
  return spyCursorReads(marker, () => {
    const rows = answers[cursorCalls++]
    if (!rows) return undefined
    return (async function* () {
      for (const row of rows) yield row
    })()
  })
}
