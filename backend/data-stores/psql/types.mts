import type pg from 'pg'
import type { SQLStatement } from 'sql-template-strings'

export type QueryInput = string | SQLStatement
export type QueryValues = ReadonlyArray<unknown> | undefined

export interface QueryExecutor {
  <Row extends pg.QueryResultRow = any>(
    input: QueryInput,
    values?: QueryValues,
  ): Promise<pg.QueryResult<Row>>
}

export type TransactionQuery = QueryExecutor & {
  client: pg.PoolClient
}

export interface QueryOptions {
  client?: pg.PoolClient | pg.Pool
  query?: QueryExecutor
  readOnly?: boolean
}

export type { PoolClient } from 'pg'
