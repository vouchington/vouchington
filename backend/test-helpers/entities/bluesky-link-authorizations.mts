import { read } from '@data-stores/psql'
import {
  observeTestPostgresQueryPools,
  type ObservedPostgresQueryPool,
} from '../postgres-query-pool-observer.mts'
import sql from 'sql-template-strings'

export interface TestBlueskyLinkAuthorizationRow {
  id: string
  status: string
  handle: string | null
}

export async function getTestBlueskyLinkAuthorizationRow(
  authorizationId: string,
): Promise<TestBlueskyLinkAuthorizationRow | null> {
  const { rows } = await read<TestBlueskyLinkAuthorizationRow>(
    sql`/* getTestBlueskyLinkAuthorizationRow */
      SELECT id, status, handle
      FROM bluesky_link_authorizations
      WHERE id = ${authorizationId}`,
  )
  return rows[0] ?? null
}

export async function observeTestBlueskyCallbackAuthorizationReadPool<Result>(
  operation: () => Promise<Result>,
): Promise<{ result: Result; pools: ObservedPostgresQueryPool[] }> {
  return observeTestPostgresQueryPools('/* readBlueskyLinkAuthorization */', operation)
}
