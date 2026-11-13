import type pg from 'pg'

export type ObservedPostgresQueryPool = 'read' | 'write'

export type ObservedClientQuery = {
  pool: ObservedPostgresQueryPool
  text: string
  values: readonly unknown[]
  connection?: object
}

export function tapClientQueries(
  pool: pg.Pool,
  label: ObservedPostgresQueryPool,
  queries: ObservedClientQuery[],
  onQueryComplete: (query: ObservedClientQuery) => Promise<void>,
  onQueryError?: (query: ObservedClientQuery, err: unknown) => void,
): () => void {
  const restoreClients: Array<() => void> = []
  const clients = new WeakMap<pg.PoolClient, { connection: object }>()
  const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
  const original = pool.connect
  const wrappedConnect = ((...args: unknown[]) => {
    if (args.some(arg => typeof arg === 'function')) return Reflect.apply(original, pool, args)
    return Promise.resolve(Reflect.apply(original, pool, args)).then(client => {
      if (!client) return client
      const previous = clients.get(client)
      if (previous) {
        previous.connection = {}
        return client
      }
      const state = { connection: {} }
      clients.set(client, state)
      const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const query = client.query
      const wrappedQuery = ((...queryArgs: unknown[]) => {
        const observed = {
          pool: label,
          text: clientQueryText(queryArgs[0]),
          values: clientQueryValues(queryArgs),
          ...(onQueryError ? { connection: state.connection } : {}),
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
        const result = Promise.resolve(pending).catch((err: unknown) => {
          try {
            onQueryError?.(observed, err)
          } catch {
            // The observer owns its diagnostics; native SQL failures remain authoritative.
            throw err
          }
          throw err
        })
        return result.then(async (value: unknown) => {
          await onQueryComplete(observed)
          return value
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
  }) as typeof pool.connect
  Object.defineProperty(pool, 'connect', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: wrappedConnect,
  })
  return () => {
    if (pool.connect === wrappedConnect) {
      if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
      else Reflect.deleteProperty(pool, 'connect')
    }
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
