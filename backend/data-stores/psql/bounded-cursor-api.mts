import { maybeCaptureQuery } from './query-capture.mts'
import {
  extractLeadingQueryAnnotation,
  type Psql,
  type QueryInput,
  type QueryValues,
} from '@vouchington/postgres'

type CursorOptions = NonNullable<Parameters<Psql['createAsyncGeneratorFromCursor']>[2]>
export type CursorRunResult<Row> = { rowsRead: number; hasMore: boolean; lastRow?: Row }
export type BoundedCursorOptions<Row> = CursorOptions & {
  maxRows?: number
  onComplete?: (result: CursorRunResult<Row>) => void
}

/** Scheduled callers provide configured bounds; complete per-user exports may omit maxRows. */
export function createBoundedCursorApi(psql: Psql) {
  async function* createAsyncGeneratorFromCursor<Row = Record<string, unknown>>(
    input: QueryInput,
    valuesOrOptions?: QueryValues | BoundedCursorOptions<Row>,
    options: BoundedCursorOptions<Row> = {},
  ): AsyncGenerator<Row, CursorRunResult<Row>, void> {
    const resolved = resolveOptions(input, valuesOrOptions, options)
    return yield* streamResolved<Row>(resolved)
  }

  async function* streamResolved<Row>(
    resolved: ReturnType<typeof resolveOptions<Row>>,
  ): AsyncGenerator<Row, CursorRunResult<Row>, void> {
    const result: CursorRunResult<Row> = {
      rowsRead: 0,
      hasMore: resolved.options.maxRows !== undefined,
    }
    try {
      maybeCaptureQuery(resolved.input, resolved.values)
      for await (const row of psql.createAsyncGeneratorFromCursor<Row>(
        resolved.input,
        resolved.values,
        resolved.options,
      )) {
        if (resolved.options.maxRows !== undefined && result.rowsRead === resolved.options.maxRows)
          return result
        result.rowsRead++
        result.lastRow = row
        yield row
      }
      result.hasMore = false
      return result
    } finally {
      resolved.options.onComplete?.(result)
    }
  }

  async function executeHandlerWithCursorInBatches<Row = Record<string, unknown>>(
    input: QueryInput,
    valuesOrOptions?:
      | QueryValues
      | (BoundedCursorOptions<Row> & { handler: (rows: Row[]) => Promise<void> }),
    options?: BoundedCursorOptions<Row> & { handler: (rows: Row[]) => Promise<void> },
  ): Promise<CursorRunResult<Row>> {
    const resolved = resolveOptions(input, valuesOrOptions, options ?? {})
    const handler = (resolved.options as typeof options)?.handler
    if (!handler) throw new Error('handler is required')
    let result: CursorRunResult<Row> = { rowsRead: 0, hasMore: false }
    let batch: Row[] = []
    const batchSize = resolved.options.batchSize
    if (!batchSize || !Number.isSafeInteger(batchSize) || batchSize < 1)
      throw new RangeError('batchSize must be a positive safe integer')
    for await (const row of streamResolved<Row>({
      ...resolved,
      options: {
        ...resolved.options,
        onComplete: completed => {
          result = completed
        },
      },
    })) {
      batch.push(row)
      if (batch.length === batchSize) {
        await handler(batch)
        batch = []
      }
    }
    if (batch.length > 0) await handler(batch)
    resolved.options.onComplete?.(result)
    return result
  }
  return { createAsyncGeneratorFromCursor, executeHandlerWithCursorInBatches }
}

function resolveOptions<Row>(
  input: QueryInput,
  valuesOrOptions: QueryValues | BoundedCursorOptions<Row> | undefined,
  options: BoundedCursorOptions<Row>,
) {
  const finalOptions =
    valuesOrOptions && !Array.isArray(valuesOrOptions)
      ? (valuesOrOptions as BoundedCursorOptions<Row>)
      : options
  const values = Array.isArray(valuesOrOptions)
    ? valuesOrOptions
    : typeof input === 'string'
      ? undefined
      : input.values
  if (finalOptions.maxRows === undefined) return { input, values, options: finalOptions }
  const maxRows = finalOptions.maxRows
  if (!Number.isSafeInteger(maxRows) || maxRows < 1)
    throw new RangeError('maxRows must be a positive safe integer')
  const text = typeof input === 'string' ? input : input.text
  const annotation = extractLeadingQueryAnnotation(text) ?? 'boundedCursor'
  const boundedValues = [...(values ?? []), maxRows + 1]
  return {
    input: `/* ${annotation} */ SELECT * FROM (${text.trimEnd().replace(/;$/, '')}) bounded_cursor_rows LIMIT $${boundedValues.length}`,
    values: boundedValues,
    options: {
      ...finalOptions,
      batchSize: Math.min(finalOptions.batchSize ?? maxRows + 1, maxRows + 1),
    },
  }
}
