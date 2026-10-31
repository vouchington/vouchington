import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbCursorScope, sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'
import { imageDeliveryAuthorityProof, imageDeliveryIsAuthorized } from './delivery-authority.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { getMediaDeliveryRegistryScanBefore } from './delivery-registry-recovery-scan.mts'

type Tuple = { placement_id: string; placement_revision: number; image_id: string }

/** Bound the base-table tuple page before legal proof or current-history view lookups. */
export async function stageImagePlacementDeliveryRecordPage(
  input: {
    imageIds?: readonly string[]
    scanBefore?: string
    after?: Tuple
  } = {},
): Promise<{ staged: number; hasMore: boolean; scanBefore: string; after?: Tuple }> {
  const limit = getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size')
  const scanBefore = input.scanBefore ?? (await getMediaDeliveryRegistryScanBefore())
  if (input.imageIds?.length === 0) return { staged: 0, hasMore: false, scanBefore }
  observeSharedDbScope(
    'stageAllCurrentImagePlacementDeliveryRecords',
    input.imageIds
      ? sharedDbIdsScope(input.imageIds)
      : sharedDbCursorScope(input.after?.placement_id),
  )
  const upperId = timestampToUuidv7LowerBound(new Date(scanBefore).getTime() + 1)
  const imageIds = input.imageIds ? [...input.imageIds] : undefined
  const after = input.after
  const lowerId = after?.placement_id ?? '00000000-0000-0000-0000-000000000000'
  const statement = sql`/* stageImagePlacementDeliveryRecordPage */ WITH `
  if (imageIds) {
    statement.append(sql`scoped_placements AS MATERIALIZED (
      SELECT page.* FROM unnest(${imageIds}::uuid[]) requested(image_id)
      CROSS JOIN LATERAL (
        SELECT placement.id AS placement_id, placement.revision AS placement_revision,
          binding.image_id, placement.retired_at IS NULL AS is_active
        FROM image_placements binding
        JOIN media_placements placement ON placement.id = binding.placement_id
        WHERE binding.image_id = requested.image_id
          AND binding.placement_id >= ${lowerId}::uuid
          AND binding.placement_id < ${upperId}::uuid`)
    if (after)
      statement.append(sql` AND (placement.id, placement.revision, binding.image_id) >
      (${after.placement_id}::uuid, ${after.placement_revision}::integer, ${after.image_id}::uuid)`)
    statement.append(sql` ORDER BY placement.id, placement.revision, binding.image_id LIMIT ${limit + 1}
      ) page
      UNION ALL
      SELECT page.* FROM unnest(${imageIds}::uuid[]) requested(image_id)
      CROSS JOIN LATERAL (
        SELECT placement.id AS placement_id, placement.revision AS placement_revision,
          binding.image_id, placement.retired_at IS NULL AS is_active
        FROM image_surface_placements binding
        JOIN media_placements placement ON placement.id = binding.placement_id
        WHERE binding.image_id = requested.image_id
          AND binding.placement_id >= ${lowerId}::uuid
          AND binding.placement_id < ${upperId}::uuid`)
    if (after)
      statement.append(sql` AND (placement.id, placement.revision, binding.image_id) >
      (${after.placement_id}::uuid, ${after.placement_revision}::integer, ${after.image_id}::uuid)`)
    statement.append(sql` ORDER BY placement.id, placement.revision, binding.image_id LIMIT ${limit + 1}
      ) page
    ), `)
  } else {
    statement.append(sql`post_bindings AS MATERIALIZED (
      SELECT placement_id, image_id FROM image_placements
      WHERE placement_id >= ${lowerId}::uuid AND placement_id < ${upperId}::uuid
      ORDER BY placement_id LIMIT ${limit + 2}
    ), surface_bindings AS MATERIALIZED (
      SELECT placement_id, image_id FROM image_surface_placements
      WHERE placement_id >= ${lowerId}::uuid AND placement_id < ${upperId}::uuid
      ORDER BY placement_id LIMIT ${limit + 2}
    ), placement_tuples AS MATERIALIZED (
      SELECT placement.id AS placement_id, placement.revision AS placement_revision,
        binding.image_id, placement.retired_at IS NULL AS is_active
      FROM (SELECT * FROM post_bindings UNION ALL SELECT * FROM surface_bindings) binding
      CROSS JOIN LATERAL (
        SELECT id, revision, retired_at FROM media_placements
        WHERE id = binding.placement_id LIMIT 1
      ) placement`)
    if (after)
      statement.append(sql` WHERE (placement.id, placement.revision, binding.image_id) >
      (${after.placement_id}::uuid, ${after.placement_revision}::integer, ${after.image_id}::uuid)`)
    statement.append(sql`), `)
  }
  statement.append(sql`candidates AS MATERIALIZED (
      SELECT placement_id, placement_revision, image_id, bool_or(is_active) AS is_active
      FROM (
        (SELECT record.placement_id, record.placement_revision, record.image_id,
          TRUE AS is_active
        FROM media_delivery_registry_records record
        WHERE record.id < ${upperId}::uuid`)
  if (imageIds) statement.append(sql` AND record.image_id = ANY(${imageIds}::uuid[])`)
  if (after)
    statement.append(sql` AND
    (record.placement_id, record.placement_revision, record.image_id) >
    (${after.placement_id}::uuid, ${after.placement_revision}::integer, ${after.image_id}::uuid)`)
  statement.append(sql`
        ORDER BY record.placement_id, record.placement_revision, record.image_id LIMIT ${limit + 1})
        UNION ALL `)
  if (imageIds) {
    statement.append(sql`(SELECT placement_id, placement_revision, image_id, is_active
      FROM scoped_placements ORDER BY placement_id, placement_revision, image_id LIMIT ${limit + 1})`)
  } else {
    statement.append(sql`(SELECT placement_id, placement_revision, image_id, is_active
      FROM placement_tuples ORDER BY placement_id, placement_revision, image_id LIMIT ${limit + 1})`)
  }
  statement.append(sql`
      ) tuples GROUP BY placement_id, placement_revision, image_id
        ORDER BY placement_id, placement_revision, image_id LIMIT ${limit + 1}
    ), active_candidates AS MATERIALIZED (
      SELECT placement_id, placement_revision, image_id FROM candidates WHERE is_active
    ), resolved AS MATERIALIZED (
      SELECT authority.*, existing.desired_state AS existing_desired_state,
        CASE WHEN `)
  statement.append(imageDeliveryAuthorityProof()).append(sql`
      THEN 'allow'::media_delivery_desired_states ELSE 'withheld'::media_delivery_desired_states END AS desired_state
    FROM active_candidates authority
    LEFT JOIN LATERAL (
      SELECT record.id FROM media_delivery_registry_records record
      WHERE record.placement_id = authority.placement_id
        AND record.placement_revision = authority.placement_revision
        -- The retained binding fixes one image per placement, and the registry FK enforces it.
      LIMIT 1
    ) record ON TRUE
    LEFT JOIN view_media_delivery_registry_current_records existing
      ON existing.media_delivery_registry_record_id = record.id
    ) SELECT raw.*, resolved.existing_desired_state, resolved.desired_state
    FROM candidates raw
    LEFT JOIN resolved ON resolved.placement_id = raw.placement_id
      AND resolved.placement_revision = raw.placement_revision AND resolved.image_id = raw.image_id
    ORDER BY raw.placement_id, raw.placement_revision, raw.image_id
  `)
  const { rows } = await write<
    Tuple & {
      is_active: boolean
      existing_desired_state: 'allow' | 'withheld' | null
      desired_state: 'allow' | 'withheld' | null
    }
  >(statement)
  let staged = 0
  const page = rows.slice(0, limit)
  for (const record of page) {
    if (!record.is_active) continue
    if (record.existing_desired_state === record.desired_state) continue
    // oxlint-disable-next-line no-await-in-loop -- each tuple retains its own authority domain.
    await stageCurrentDeliveryRecord(record)
    staged++
  }
  const last = page.at(-1)
  return {
    staged,
    hasMore: rows.length > limit,
    scanBefore,
    ...(last && {
      after: {
        placement_id: last.placement_id,
        placement_revision: last.placement_revision,
        image_id: last.image_id,
      },
    }),
  }
}

async function stageCurrentDeliveryRecord(record: Tuple): Promise<void> {
  await using transaction = await beginTransaction()
  await lockImageDeliveryMutation(transaction, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  const state = (await imageDeliveryIsAuthorized(transaction, record)) ? 'allow' : 'withheld'
  await stageImagePlacementDeliveryRecord(
    {
      placementId: record.placement_id,
      revision: record.placement_revision,
      imageId: record.image_id,
      state,
    },
    { query: transaction },
  )
  await transaction.commit()
}
