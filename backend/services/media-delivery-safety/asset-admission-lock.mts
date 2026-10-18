import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'

/** Binding admission and unsafe asset mutation acquire this root domain before discovering placements. */
export async function lockImageAssetAdmission(
  imageIds: string[],
  query: QueryExecutor,
): Promise<void> {
  assertImageDeliveryTransaction(query)
  const ids = [...new Set(imageIds)].toSorted()
  if (!ids.length) return
  const { rows } = await query(sql`/* lockImageAssetAdmission:reserve */
    WITH requested AS MATERIALIZED (
      SELECT DISTINCT asset::uuid::text AS asset
      FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) AS input(asset)
      ORDER BY asset
    ), requested_set AS MATERIALIZED (
      SELECT jsonb_agg(asset ORDER BY asset) AS assets, count(*) AS size FROM requested
    ), state AS (
      SELECT COALESCE(NULLIF(current_setting('voucha.media_delivery_admission', true), ''),
        '{"assets":[],"started":false}')::jsonb AS value
    ), permitted AS MATERIALIZED (
      SELECT value FROM state, requested_set WHERE (assets <@ (value->'assets'))
        OR (value->'assets' = '[]'::jsonb AND NOT (value->>'started')::boolean)
    ), locked AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended('image-asset-admission:' || asset, 0))
      FROM (SELECT asset FROM requested ORDER BY asset) ordered
      WHERE EXISTS (SELECT 1 FROM permitted)
    )
    SELECT set_config('voucha.media_delivery_admission',
      (value || jsonb_build_object('assets', CASE WHEN value->'assets' = '[]'::jsonb
        THEN assets ELSE value->'assets' END))::text, true)
    FROM permitted, requested_set WHERE (SELECT count(*) FROM locked) = size
  `)
  if (!rows.length)
    throw new Error('Declare all image admission assets before owner or placement authority')
}

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

/** Marks authority started in the same statement that share-locks and checks the images. */
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
    ORDER BY id FOR SHARE
  `)
  const { rows } = await query<{ id: string; expected: string }>(statement)
  if (!rows.length || rows.length !== Number(rows[0]!.expected))
    throw new Error('Image is not ready for a public surface')
}

export async function prepareImageSurfaceAdmission(
  imageIds: string[],
  query: QueryExecutor,
): Promise<void> {
  await lockImageAssetAdmission(imageIds, query)
  await assertImagesReadyForSurface(imageIds, query)
}
