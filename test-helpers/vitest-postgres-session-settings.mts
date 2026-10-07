import { TEST_HNSW_EF_SEARCH } from '../backend/test-helpers/vector-search-recall-constant.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from '../backend/test-helpers/statement-timeout-constant.mts'

export function configureTestPostgresSessions(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of ['DATABASE_URL', 'READ_DATABASE_URL'] as const) {
    const value = env[key]
    if (!value) continue
    const url = new URL(value)
    const settings = `-c statement_timeout=${TEST_STATEMENT_TIMEOUT_MS} -c hnsw.ef_search=${TEST_HNSW_EF_SEARCH}`
    const parts = url.search ? url.search.slice(1).split('&') : []
    const updated: string[] = []
    let foundOptions = false
    for (const part of parts) {
      if (!new URLSearchParams(part).has('options')) {
        updated.push(part)
        continue
      }
      if (foundOptions) continue
      foundOptions = true
      // libpq treats a raw '+' in options literally; URLSearchParams decodes it as a space.
      const equalsAt = part.indexOf('=')
      const rawOptions = equalsAt < 0 ? '' : part.slice(equalsAt + 1)
      const previous =
        new URLSearchParams(`options=${rawOptions.replaceAll('+', '%2B')}`).get('options') ?? ''
      const next = previous.endsWith(settings) ? previous : `${previous} ${settings}`
      updated.push(`options=${encodeURIComponent(next)}`)
    }
    if (!foundOptions) updated.push(`options=${encodeURIComponent(`-c jit=off ${settings}`)}`)
    // Only rewrite options: URLSearchParams.set() would change %20 to '+' in unrelated values.
    url.search = `?${updated.join('&')}`
    env[key] = url.toString()
  }
}
