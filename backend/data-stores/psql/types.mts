import type pg from 'pg'
import type {
  QueryInput,
  QueryOptions as PostgresQueryOptions,
  QueryValues,
} from '@vouchington/postgres'
export type { PoolClient, QueryInput, QueryValues } from '@vouchington/postgres'

export type QueryMethod = <Row extends pg.QueryResultRow = Record<string, unknown>>(
  input: QueryInput,
  valuesOrOptions?: QueryValues | QueryOptions,
  options?: QueryOptions,
) => Promise<pg.QueryResult<Row>>

export type QueryExecutor = <Row extends pg.QueryResultRow = Record<string, unknown>>(
  input: QueryInput,
  values?: QueryValues,
) => Promise<pg.QueryResult<Row>>

export type TransactionQuery = QueryExecutor & { client: pg.PoolClient }

export type QueryOptions = Omit<PostgresQueryOptions, 'query'> & { query?: QueryExecutor }
