import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getTestPostgresBackendProcessId as readBackendProcessId,
  testBlockedBackendHoldsRelation as checkBlockedBackendHoldsRelation,
} from 'vouchington-tooling/postgres-test-faults'

/** Returns the PostgreSQL backend PID serving `query`'s current connection. */
export function getTestPostgresBackendProcessId(query: QueryExecutor): Promise<number> {
  return readBackendProcessId(async ({ text }) => query(sql``.append(text)))
}

/** True when a backend blocked by `holderProcessId` already holds `relationName`. */
export function testBlockedBackendHoldsRelation(
  holderProcessId: number,
  relationName: string,
): Promise<boolean> {
  return checkBlockedBackendHoldsRelation(
    ({ text, values }) => write(text, values),
    holderProcessId,
    relationName,
  )
}
