import { read } from '@data-stores/psql'
import { readTestDatabaseTimestamp as readDatabaseTimestamp } from 'vouchington-tooling/postgres-test-faults'

/** PostgreSQL clock, so sweep cutoffs stay after rows this process just inserted. */
export function readTestDatabaseTimestamp(): Promise<string> {
  return readDatabaseTimestamp(({ text, values }) => read(text, values))
}
