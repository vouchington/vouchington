import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestPostgresBackendProcessId as readBackendProcessId } from 'vouchington-tooling/postgres-test-faults'

/** Returns the PostgreSQL backend PID serving `query`'s current connection. */
export function getTestPostgresBackendProcessId(query: QueryExecutor): Promise<number> {
  return readBackendProcessId(async ({ text }) => query(sql``.append(text)))
}

/** True when a backend blocked by `holderProcessId` already holds `relationName`. */
export async function testBlockedBackendHoldsRelation(
  holderProcessId: number,
  relationName: string,
): Promise<boolean> {
  const { rows } = await write<{ holds: boolean }>(sql`
    /* testBlockedBackendHoldsRelation */
    SELECT EXISTS (
      SELECT 1
      FROM pg_locks waiting
      WHERE NOT waiting.granted
        AND ${holderProcessId} = ANY(pg_blocking_pids(waiting.pid))
        AND EXISTS (
          SELECT 1
          FROM pg_locks held
          WHERE held.pid = waiting.pid
            AND held.granted
            AND held.relation IN (
              SELECT relid FROM pg_partition_tree(${relationName}::regclass)
            )
        )
    ) AS holds
  `)
  return rows[0]?.holds ?? false
}
