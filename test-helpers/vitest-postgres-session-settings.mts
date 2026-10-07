import { TEST_HNSW_EF_SEARCH } from '../backend/test-helpers/vector-search-recall-constant.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from '../backend/test-helpers/statement-timeout-constant.mts'

export function configureTestPostgresSessions(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of ['DATABASE_URL', 'READ_DATABASE_URL'] as const) {
    const value = env[key]
    if (!value) continue
    const settings = `-c statement_timeout=${TEST_STATEMENT_TIMEOUT_MS} -c hnsw.ef_search=${TEST_HNSW_EF_SEARCH}`
    const fragmentAt = value.indexOf('#')
    const beforeFragment = fragmentAt < 0 ? value : value.slice(0, fragmentAt)
    const fragment = fragmentAt < 0 ? '' : value.slice(fragmentAt)
    const queryAt = beforeFragment.indexOf('?')
    const connection = queryAt < 0 ? beforeFragment : beforeFragment.slice(0, queryAt)
    const query = queryAt < 0 ? '' : beforeFragment.slice(queryAt + 1)
    const parts = query ? query.split('&') : []
    const lastOptionsIndex = parts.findLastIndex(part => new URLSearchParams(part).has('options'))
    const updated: string[] = []
    for (const [index, part] of parts.entries()) {
      if (!new URLSearchParams(part).has('options')) {
        updated.push(part)
        continue
      }
      if (index !== lastOptionsIndex) continue
      // libpq treats a raw '+' in options literally; URLSearchParams decodes it as a space.
      const equalsAt = part.indexOf('=')
      const rawOptions = equalsAt < 0 ? '' : part.slice(equalsAt + 1)
      const previous =
        new URLSearchParams(`options=${rawOptions.replaceAll('+', '%2B')}`).get('options') ?? ''
      const next = previous.endsWith(settings) ? previous : `${previous} ${settings}`
      updated.push(`options=${encodeURIComponent(next)}`)
    }
    if (lastOptionsIndex < 0)
      updated.push(`options=${encodeURIComponent(`-c jit=off ${settings}`)}`)
    // Keep the original URI and unrelated query bytes, including hostless socket URLs and %20.
    env[key] = `${connection}?${updated.join('&')}${fragment}`
  }
}
