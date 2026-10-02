import sql, { type SQLStatement } from 'sql-template-strings'
import { beginTransaction, read, readPool } from '@data-stores/psql'

/**
 * `relaxed_order`, not `strict_order`: strict mode silently drops any row that a resumed scan
 * finds nearer than the last row it already emitted, so a selective filter could return an empty
 * or incomplete window (#1751). The window CTE only needs the set of nearest ids and the outer
 * query re-sorts them, so order within the window never reaches a caller.
 */
export const SEMANTIC_POST_SEARCH_SETTINGS = {
  'hnsw.iterative_scan': 'relaxed_order',
  'hnsw.ef_search': '100',
  'hnsw.max_scan_tuples': '20000',
} as const

export async function executePostSearchQuery(query: SQLStatement, hasSemanticSearch: boolean) {
  if (!hasSemanticSearch) return read(query)

  await using transaction = await beginTransaction({ client: readPool })
  await transaction(sql`/* executePostSearchQuery */
    SELECT set_config('hnsw.iterative_scan', ${SEMANTIC_POST_SEARCH_SETTINGS['hnsw.iterative_scan']}, true),
           set_config('hnsw.ef_search', ${SEMANTIC_POST_SEARCH_SETTINGS['hnsw.ef_search']}, true),
           set_config('hnsw.max_scan_tuples', ${SEMANTIC_POST_SEARCH_SETTINGS['hnsw.max_scan_tuples']}, true),
           set_config('plan_cache_mode', 'force_custom_plan', true)`)
  const result = await transaction(query)
  await transaction.commit()
  return result
}
