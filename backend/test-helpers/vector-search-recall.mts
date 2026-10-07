import { read } from '@data-stores/psql'

export { TEST_HNSW_EF_SEARCH } from './vector-search-recall-constant.mts'

export async function getSessionHnswEfSearch(): Promise<number> {
  const { rows } = await read(`SELECT current_setting('hnsw.ef_search') AS ef_search`)
  return Number.parseInt(rows[0].ef_search, 10)
}
