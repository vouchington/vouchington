import sql, { type SQLStatement } from 'sql-template-strings'
import { beginTransaction, read, readPool } from '@data-stores/psql'
import { SEMANTIC_POST_CANDIDATE_LIMIT } from './query-builder/semantic-candidates.mts'

export const SEMANTIC_POST_SEARCH_SETTINGS = {
  'hnsw.iterative_scan': 'strict_order',
  'hnsw.ef_search': String(SEMANTIC_POST_CANDIDATE_LIMIT),
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
