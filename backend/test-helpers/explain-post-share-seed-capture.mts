import { beginTransaction } from '../data-stores/psql/setup.mts'
import type { QueryExecutor } from '../data-stores/psql/types.mts'
import { seedPostFeedShares } from '../scripts/explain-analyze/seed-data/post-feed-shares.mts'

/** Capture seed statements while committing and disposing a real, empty owned transaction. */
export async function capturePostShareSeedStatements(): Promise<
  Array<{ text: string; values: readonly unknown[] }>
> {
  const transaction = await beginTransaction()
  const statements: Array<{ text: string; values: readonly unknown[] }> = []
  const capture = new Proxy(transaction, {
    apply(_target, _thisArgument, args: Parameters<QueryExecutor>) {
      const [input, parameters] = args
      if (typeof input !== 'string') throw new Error('Expected a text seed statement')
      statements.push({ text: input, values: parameters ?? [] })
      return Promise.resolve({ rows: [], rowCount: 0 })
    },
  })
  await seedPostFeedShares(capture)
  return statements
}
