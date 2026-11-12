import type pg from 'pg'

export type ObservedPostgresQueryPool = 'read' | 'write'

export type ObservedClientQuery = {
  pool: ObservedPostgresQueryPool
  text: string
  values: readonly unknown[]
}

export function tapClientQueries(
  pool: pg.Pool,
  label: ObservedPostgresQueryPool,
  queries: ObservedClientQuery[],
  onQueryComplete: (query: ObservedClientQuery) => Promise<void>,
): () => void {
  const restoreClients: Array<() => void> = []
  const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
  const original = pool.connect
  Object.defineProperty(pool, 'connect', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: ((...args: unknown[]) => {
      if (args.some(arg => typeof arg === 'function')) return Reflect.apply(original, pool, args)
      return Promise.resolve(Reflect.apply(original, pool, args)).then(client => {
        if (!client) return client
        const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
        const query = client.query
        const wrappedQuery = ((...queryArgs: unknown[]) => {
          const observed = {
            pool: label,
            text: clientQueryText(queryArgs[0]),
            values: clientQueryValues(queryArgs),
          }
          queries.push(observed)
          const pending = Reflect.apply(query, client, queryArgs)
          if (
            queryArgs.some(arg => typeof arg === 'function') ||
            typeof pending !== 'object' ||
            pending === null ||
            !('then' in pending) ||
            typeof pending.then !== 'function'
          )
            return pending
          return Promise.resolve(pending).then(async (result: unknown) => {
            await onQueryComplete(observed)
            return result
          })
        }) as typeof client.query
        client.query = wrappedQuery
        restoreClients.push(() => {
          if (client.query !== wrappedQuery) return
          if (queryDescriptor) Object.defineProperty(client, 'query', queryDescriptor)
          else Reflect.deleteProperty(client, 'query')
        })
        return client
      })
    }) as typeof pool.connect,
  })
  return () => {
    if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
    else Reflect.deleteProperty(pool, 'connect')
    for (const restore of restoreClients.toReversed()) restore()
  }
}

export function clientQueryText(input: unknown): string {
  if (typeof input === 'string') return input
  if (typeof input === 'object' && input !== null && 'text' in input) return String(input.text)
  return ''
}

function clientQueryValues(args: readonly unknown[]): readonly unknown[] {
  const [input, parameters] = args
  if (
    typeof input === 'object' &&
    input !== null &&
    'values' in input &&
    Array.isArray(input.values)
  )
    return input.values
  return Array.isArray(parameters) ? parameters : []
}
