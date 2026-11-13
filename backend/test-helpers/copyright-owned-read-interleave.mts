import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'

/** Run the sibling once after the owned read, including when the reader aborts before it. */
export async function interleaveCopyrightOwnedRead<First, Second>(input: {
  ownedId: string
  marker: string
  first: () => Promise<First>
  second: () => Promise<Second>
}) {
  let sibling: Promise<PromiseSettledResult<Second>> | undefined
  let reached = false
  const startSibling = () => (sibling ??= settleCopyrightActor(input.second))
  const observed = await observeTestPostgresClientQueries(
    async () => {
      const first = await settleCopyrightActor(input.first)
      const second = await startSibling()
      return { first, second }
    },
    async query => {
      if (reached || !query.text.includes(`/* ${input.marker} */`)) return
      if (!query.values.some(value => ownsCopyrightRead(value, input.ownedId))) return
      reached = true
      await startSibling()
    },
    () => {},
  )
  return { ...observed.result, reached, observerErrors: observed.observerErrors }
}

export async function settleCopyrightActor<Result>(operation: () => Promise<Result>) {
  try {
    return { status: 'fulfilled', value: await operation() } as const
  } catch (err) {
    return { status: 'rejected', reason: err } as const
  }
}

function ownsCopyrightRead(value: unknown, id: string): boolean {
  return Array.isArray(value) ? value.some(item => ownsCopyrightRead(item, id)) : value === id
}
