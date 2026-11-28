import sql, { type SQLStatement } from 'sql-template-strings'
import { readPool } from './runtime.mts'
import { beginTransaction } from './setup.mts'

export type HnswSearchSettings = {
  readonly 'hnsw.iterative_scan': 'relaxed_order' | 'strict_order' | 'off'
  readonly 'hnsw.ef_search': string
  readonly 'hnsw.max_scan_tuples': string
}

/**
 * `relaxed_order`, not `strict_order`: strict mode silently drops any row that a resumed scan
 * finds nearer than the last row it already emitted, so a selective filter could return an empty
 * or incomplete window (#1751). The outer query re-sorts the bounded nearest-neighbour prefix, so
 * scan order within the prefix never reaches a caller.
 */
export const HNSW_SEARCH_BASE_SETTINGS = {
  'hnsw.iterative_scan': 'relaxed_order',
  'hnsw.max_scan_tuples': '20000',
} as const

/**
 * Runs a read-replica HNSW search query in a transaction with transaction-local `set_config`
 * parameters and `plan_cache_mode = 'force_custom_plan'`.
 */
export async function readWithHnswSettings<Row extends object = Record<string, unknown>>(
  query: SQLStatement,
  settings: HnswSearchSettings,
) {
  await using transaction = await beginTransaction({ client: readPool })
  await transaction(sql`/* readWithHnswSettings */
    SELECT set_config('hnsw.iterative_scan', ${settings['hnsw.iterative_scan']}, true),
           set_config('hnsw.ef_search', ${settings['hnsw.ef_search']}, true),
           set_config('hnsw.max_scan_tuples', ${settings['hnsw.max_scan_tuples']}, true),
           set_config('plan_cache_mode', 'force_custom_plan', true)`)
  const result = await transaction<Row>(query)
  await transaction.commit()
  return result
}
