import { read } from '@data-stores/psql'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// Straight duplicate of test-helpers' vector-search-recall.mts helpers used by
// __tests__/vector-search-recall.test.mts. raiseHnswEfSearchForTestDatabase() is intentionally not
// duplicated here — it's only called from the repo-root vitest globalSetup, never from a psql test
// file directly.

export const TEST_HNSW_EF_SEARCH = 1000

export async function getSessionHnswEfSearch(): Promise<number> {
  const { rows } = await read(`SELECT current_setting('hnsw.ef_search') AS ef_search`)
  return Number.parseInt(rows[0].ef_search, 10)
}

export function makeRandomEmbedding(length = 1024): number[] {
  return normalize(Array.from({ length }, () => Math.random() - 0.5))
}

export function makeNearbyEmbedding(base: number[], scale = 0.05): number[] {
  const noise = makeRandomEmbedding(base.length)
  return normalize(base.map((x, i) => x + scale * noise[i]))
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}
