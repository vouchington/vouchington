import type { QueryExecutor } from '@data-stores/psql'
import type { PrivateUser } from '../services/users/types.mts'
import {
  recordCopyrightTrustedFlaggerChange,
  type CopyrightTrustedFlaggerChangeType,
} from '../services/copyright-notices/trusted-flaggers.mts'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Force both owned writers to observe the same real latest event before either appends. */
export async function raceTestCopyrightTrustedFlaggerChanges(
  administrator: PrivateUser,
  flaggerId: string,
  changeType: CopyrightTrustedFlaggerChangeType,
) {
  const predecessors: (string | null)[] = []
  let release!: () => void
  const barrier = new Promise<void>(resolve => {
    release = resolve
  })
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
          const result = await Reflect.apply(target, thisArgument, argumentsList)
          const [input, parameters] = argumentsList
          const text = typeof input === 'string' ? input : input.text
          const values = typeof input === 'string' ? (parameters ?? []) : (input.values ?? [])
          if (
            text.includes('/* recordCopyrightTrustedFlaggerChange:latest */') &&
            values.includes(flaggerId)
          ) {
            const row = result.rows[0] as { id: string } | undefined
            predecessors.push(row?.id ?? null)
            if (predecessors.length === 2) release()
            await barrier
          }
          return result
        },
      }),
  )
  async function append(reason: string) {
    try {
      return await recordCopyrightTrustedFlaggerChange(administrator, flaggerId, {
        changeType,
        reason,
      })
    } catch (err) {
      release()
      throw err
    }
  }
  try {
    const results = await Promise.allSettled([
      append('First competing transition'),
      append('Second competing transition'),
    ])
    return { results, predecessors }
  } finally {
    release()
    restore()
  }
}
