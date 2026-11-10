import { extractQueryName, writePool, type PoolClient } from '@data-stores/psql'
import { maybeCaptureQuery } from '@data-stores/psql/query-capture'

/** Capture only named raw client queries during one native scenario callback. */
export function captureNamedRawPoolQueries(names: readonly string[]): () => void {
  const selected = new Set(names)
  const originals = new Map<PoolClient, PoolClient['query']>()
  const onAcquire = (client: PoolClient) => {
    if (originals.has(client)) return
    const originalQuery = client.query
    originals.set(client, originalQuery)
    client.query = new Proxy(originalQuery, {
      apply(target, _receiver, args: unknown[]) {
        const [input, values] = args
        const text = queryText(input)
        const boundValues = queryValues(input, values)
        if (text && selected.has(extractQueryName(text) ?? '')) maybeCaptureQuery(text, boundValues)
        return Reflect.apply(target, client, args) as unknown
      },
    }) as typeof client.query
  }
  writePool.on('acquire', onAcquire)
  return () => {
    writePool.off('acquire', onAcquire)
    for (const [client, originalQuery] of originals) client.query = originalQuery
    originals.clear()
  }
}

function queryText(input: unknown): string | undefined {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object' && 'text' in input && typeof input.text === 'string')
    return input.text
  return undefined
}

function queryValues(input: unknown, values: unknown): readonly unknown[] | undefined {
  if (Array.isArray(values)) return values as unknown[]
  if (input && typeof input === 'object' && 'values' in input && Array.isArray(input.values))
    return input.values as unknown[]
  return undefined
}

export function selectCapturedSetupSql(
  label: string,
  captured: readonly { text: string; values: readonly unknown[] }[],
  names?: readonly string[],
  expectedCount?: number,
): string | undefined {
  if (!names) return undefined
  const selected = captured.filter(query => names.includes(extractQueryName(query.text) ?? ''))
  if (
    names.some(name => !selected.some(query => extractQueryName(query.text) === name)) ||
    (expectedCount !== undefined && selected.length !== expectedCount)
  )
    throw new Error(`${label} did not capture the requested setup queries`)
  if (selected.some(query => query.values.length > 0))
    throw new Error(`${label} setup statements must be parameter-free`)
  return selected.map(query => query.text).join('\n;\n')
}
