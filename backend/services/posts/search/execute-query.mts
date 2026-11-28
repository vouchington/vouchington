import type { SQLStatement } from 'sql-template-strings'
import { HNSW_SEARCH_BASE_SETTINGS, read, readWithHnswSettings } from '@data-stores/psql'

export const SEMANTIC_POST_SEARCH_SETTINGS = {
  ...HNSW_SEARCH_BASE_SETTINGS,
  'hnsw.ef_search': '100',
} as const

export async function executePostSearchQuery<Row extends object = Record<string, unknown>>(
  query: SQLStatement,
  hasSemanticSearch: boolean,
) {
  if (!hasSemanticSearch) return read<Row>(query)
  return readWithHnswSettings<Row>(query, SEMANTIC_POST_SEARCH_SETTINGS)
}
