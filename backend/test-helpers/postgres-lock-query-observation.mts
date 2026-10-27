import type { PoolClient } from '@data-stores/psql'

export type TestPostgresLockQuery = {
  marker: string
  binding: { index: number; value: string | readonly string[] }
}

/** Observe native query configs without changing transaction identity or returned promises. */
export function observeTestPostgresLockQuery(client: PoolClient, selected: TestPostgresLockQuery) {
  const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
  const query = client.query
  let pendingQueries = 0
  let selectedPending = false
  client.query = ((...args: unknown[]) => {
    const input = args[0]
    if (
      args.length !== 1 ||
      typeof input !== 'object' ||
      input === null ||
      !('text' in input) ||
      typeof input.text !== 'string' ||
      'callback' in input ||
      'submit' in input
    )
      throw new Error('Owned lock observation requires native Promise query configs')
    const matches = input.text.trimStart().startsWith(selected.marker)
    if (
      matches &&
      (!('values' in input) ||
        !Array.isArray(input.values) ||
        !sameBinding(input.values[selected.binding.index], selected.binding.value))
    )
      throw new Error('Owned lock SQL did not target the expected bound identity')
    if (selectedPending || (matches && pendingQueries !== 0))
      throw new Error('Owned lock observation does not support queued or pipelined lock SQL')
    pendingQueries += 1
    selectedPending = matches
    const completed = () => {
      pendingQueries -= 1
      if (matches) selectedPending = false
    }
    try {
      const pending = Reflect.apply(query, client, args)
      void pending.then(completed, completed)
      return pending
    } catch (err) {
      completed()
      throw err
    }
  }) as typeof client.query
  return {
    get selectedPending() {
      return selectedPending
    },
    get pendingQueries() {
      return pendingQueries
    },
    restore() {
      if (descriptor) Object.defineProperty(client, 'query', descriptor)
      else Reflect.deleteProperty(client, 'query')
    },
  }
}

function sameBinding(actual: unknown, expected: string | readonly string[]): boolean {
  if (typeof expected === 'string') return actual === expected
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((value, index) => actual[index] === value)
  )
}
