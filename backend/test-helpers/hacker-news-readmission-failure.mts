import type { QueryResult, QueryResultRow } from 'pg'
import { read } from '@data-stores/psql'
import type { QueryExecutor, QueryInput, QueryValues } from '@data-stores/psql/types'

export function createReadmissionFirstPageFailureForTest(
  onPageQuery: (attempt: number, cutoff: unknown) => Promise<void>,
): { query: QueryExecutor; pageCalls: () => number } {
  let calls = 0
  const failure = new Error('Injected first-page readmission query failure')
  async function query<Row extends QueryResultRow = QueryResultRow>(
    input: QueryInput,
    values?: QueryValues,
  ): Promise<QueryResult<Row>> {
    const text = typeof input === 'string' ? input : input.text
    if (text.trimStart().startsWith('/* readmitHackerNewsLookupPage */')) {
      calls += 1
      const bindings = typeof input === 'string' ? values : input.values
      await onPageQuery(calls, bindings?.[0])
      if (calls === 1) throw failure
    }
    return read<Row>(input, values)
  }
  return { query, pageCalls: () => calls }
}
