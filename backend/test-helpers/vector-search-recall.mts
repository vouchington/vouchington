import { read, write } from '@data-stores/psql'

/**
 * pgvector's maximum `hnsw.ef_search`. At test-database scale (tens to hundreds of vectors) a
 * candidate list this large makes HNSW scans effectively exhaustive, so tests that assert a
 * fixture ranks in `<=>`-ordered results are deterministic instead of subject to approximate
 * recall (issue #6781).
 */
export const TEST_HNSW_EF_SEARCH = 1000

/**
 * Persists TEST_HNSW_EF_SEARCH as the database-level default so every session opened by test
 * workers gets it. Run from vitest global setup, before test workers fork and connect.
 */
export async function raiseHnswEfSearchForTestDatabase(): Promise<void> {
  await write(
    `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET hnsw.ef_search = ${TEST_HNSW_EF_SEARCH}', current_database()); END $$;`,
  )
}

export async function getSessionHnswEfSearch(): Promise<number> {
  const { rows } = await read(`SELECT current_setting('hnsw.ef_search') AS ef_search`)
  return Number.parseInt(rows[0].ef_search, 10)
}
