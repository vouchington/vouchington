import type pg from 'pg'
import type { QueryInput, QueryOptions, QueryValues } from '@vouchington/postgres'

// Preserve canonical transaction type identities for PostgreSQL effect tracing.
export type {
  PoolClient,
  QueryExecutor,
  QueryInput,
  QueryOptions,
  QueryValues,
  TransactionQuery,
} from '@vouchington/postgres'

export type QueryMethod = <Row extends pg.QueryResultRow = Record<string, unknown>>(
  input: QueryInput,
  valuesOrOptions?: QueryValues | QueryOptions,
  options?: QueryOptions,
) => Promise<pg.QueryResult<Row>>
