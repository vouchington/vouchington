import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'

/**
 * SQL expression that records the transaction-local "authority started" marker. Statements that
 * already run once per authority step embed it, so the marker costs no extra round trip.
 */
export function imageDeliveryAuthorityStartedSql(): ReturnType<typeof sql> {
  return sql`set_config('voucha.media_delivery_admission',
    (COALESCE(NULLIF(current_setting('voucha.media_delivery_admission', true), ''),
      '{"assets":[],"started":false}')::jsonb || '{"started":true}'::jsonb)::text, true)`
}

/** PostgreSQL-local state follows borrowed clients and rolls back with savepoints, not pool lifetime. */
export async function markImageDeliveryAuthorityStarted(query: QueryExecutor): Promise<void> {
  assertImageDeliveryTransaction(query)
  const statement = sql`/* markImageDeliveryAuthorityStarted */ SELECT `
  statement.append(imageDeliveryAuthorityStartedSql())
  await query(statement)
}

/** Checks the current readiness; concrete reservation policy FKs arbitrate concurrent changes. */
export async function assertImagesReadyForSurface(
  imageIds: string[],
  query: QueryExecutor,
): Promise<void> {
  const ids = [...new Set(imageIds)].toSorted()
  if (!ids.length) return
  assertImageDeliveryTransaction(query)
  const statement = sql`/* assertImagesReadyForSurface */
    SELECT id, (SELECT count(DISTINCT asset) FROM unnest(${ids}::uuid[]) AS requested(asset)) AS expected,
      `
  statement.append(imageDeliveryAuthorityStartedSql())
  statement.append(sql` AS authority_started
    FROM images WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL AND upload_completed_at IS NOT NULL AND quarantine_pending_at IS NULL
      AND is_flagged_by_openai_omni_moderation = FALSE AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_created_at IS NOT NULL
    ORDER BY id
  `)
  const { rows } = await query<{ id: string; expected: string }>(statement)
  if (!rows.length || rows.length !== Number(rows[0]!.expected))
    throw new Error('Image is not ready for a public surface')
}
