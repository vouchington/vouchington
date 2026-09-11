import sql, { type SQLStatement } from 'sql-template-strings'

type FilteredVectorScanQuery = (input: SQLStatement) => Promise<unknown>

/**
 * Filtered HNSW vector search overfilters: pgvector gathers ~`hnsw.ef_search` candidates by
 * distance first, then applies `WHERE` filters, so a small hard-capped result window (e.g. a
 * LIMIT 10 tool call after moderation filters) can under-return. Iterative index scans
 * (pgvector >= 0.8) keep the HNSW index and resume graph traversal when filters drop the
 * candidate set below LIMIT, bounded by `hnsw.max_scan_tuples`; `strict_order` preserves exact
 * distance ordering while doing so. Call this once per transaction, before running the filtered
 * vector query, so production and test callers can never drift on the setting or its value.
 */
export async function applyFilteredVectorScan(query: FilteredVectorScanQuery): Promise<void> {
  await query(sql`SET LOCAL hnsw.iterative_scan = strict_order`)
}
