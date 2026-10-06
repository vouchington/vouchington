import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** PostgreSQL clock, so sweep cutoffs stay after rows this process just inserted. */
export async function readTestDatabaseTimestamp(): Promise<string> {
  const { rows } = await read<{ database_timestamp: string }>(
    sql`/* readTestDatabaseTimestamp */
      SELECT to_char(
        clock_timestamp() AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS database_timestamp`,
  )
  const value = rows[0]?.database_timestamp
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) {
    return value
  }
  throw new Error('readTestDatabaseTimestamp: missing database timestamp')
}
