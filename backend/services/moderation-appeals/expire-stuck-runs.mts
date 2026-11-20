import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { markAppealResolutionRunsExpired } from './rerun-outcomes.mts'

/**
 * Expires one page of active appeal runs older than `cutoffId` (a UUIDv7 bound computed once per
 * sweep). The page is read from the primary so a run expired by the previous page never returns,
 * and the expire is conditional, so a run that finished meanwhile is left alone. Returns the rows
 * read: a full page means another page may follow. `runIds` only scopes a test to rows it owns.
 */
export async function expireStuckAppealResolutionRunPage(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* listStuckAppealResolutionRuns */
    SELECT id, moderation_appeal_id
    FROM moderation_appeal_resolution_runs
    WHERE id < ${cutoffId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${batchSize}`)
  const { rows } = await write<{ id: string; moderation_appeal_id: string }>(query)
  await markAppealResolutionRunsExpired(
    rows.map(row => ({ appealId: row.moderation_appeal_id, runId: row.id })),
  )
  return rows.length
}
