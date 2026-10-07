import { read } from '@data-stores/psql'

export { TEST_HNSW_EF_SEARCH } from '../../vector-search-recall-constant.mts'

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
