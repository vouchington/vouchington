import { TEST_HNSW_EF_SEARCH } from '../backend/test-helpers/vector-search-recall-constant.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from '../backend/test-helpers/statement-timeout-constant.mts'

export function configureTestPostgresSessions(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of ['DATABASE_URL', 'READ_DATABASE_URL'] as const) {
    const value = env[key]
    if (!value) continue
    const url = new URL(value)
    const previous = url.searchParams.get('options') ?? '-c jit=off'
    const settings = `-c statement_timeout=${TEST_STATEMENT_TIMEOUT_MS} -c hnsw.ef_search=${TEST_HNSW_EF_SEARCH}`
    if (!previous.endsWith(settings)) url.searchParams.set('options', `${previous} ${settings}`)
    env[key] = url.toString()
  }
}
