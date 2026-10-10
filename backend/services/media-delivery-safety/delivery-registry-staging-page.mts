import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
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
    sharedDbIdsScope(input.imageIds),
  )
  const upperId = timestampToUuidv7LowerBound(new Date(scanBefore).getTime() + 1)
  const imageIds = input.imageIds ? [...input.imageIds] : null
  const after = input.after
  const statement = sql`/* stageImagePlacementDeliveryRecordPage */
    WITH candidates AS MATERIALIZED (
      SELECT placement_id, placement_revision, image_id FROM (
        (SELECT record.placement_id, record.placement_revision, record.image_id
        FROM media_delivery_registry_records record
        WHERE record.id < ${upperId}::uuid
          AND (${imageIds}::uuid[] IS NULL OR record.image_id = ANY(${imageIds}::uuid[]))
          AND (${after?.placement_id ?? null}::uuid IS NULL OR
            (record.placement_id, record.placement_revision, record.image_id) >
            (${after?.placement_id ?? null}::uuid, ${after?.placement_revision ?? null}::integer, ${after?.image_id ?? null}::uuid))
        ORDER BY record.placement_id, record.placement_revision, record.image_id LIMIT ${limit + 1})
        UNION
        (SELECT placement.id, placement.revision, binding.image_id
        FROM media_placements placement
        JOIN (SELECT placement_id, image_id FROM image_placements
          UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
          ON binding.placement_id = placement.id
        WHERE placement.id < ${upperId}::uuid AND placement.retired_at IS NULL
          AND (${imageIds}::uuid[] IS NULL OR binding.image_id = ANY(${imageIds}::uuid[]))
          AND (${after?.placement_id ?? null}::uuid IS NULL OR
            (placement.id, placement.revision, binding.image_id) >
            (${after?.placement_id ?? null}::uuid, ${after?.placement_revision ?? null}::integer, ${after?.image_id ?? null}::uuid))
        ORDER BY placement.id, placement.revision, binding.image_id LIMIT ${limit + 1})
      ) tuples ORDER BY placement_id, placement_revision, image_id LIMIT ${limit + 1}
    ) SELECT authority.*, existing.desired_state AS existing_desired_state,
      CASE WHEN `
  statement.append(imageDeliveryAuthorityProof()).append(sql`
      THEN 'allow'::media_delivery_desired_states ELSE 'withheld'::media_delivery_desired_states END AS desired_state
    FROM candidates authority
    LEFT JOIN media_delivery_registry_records record
      ON record.placement_id = authority.placement_id AND record.placement_revision = authority.placement_revision
      AND record.image_id = authority.image_id
    LEFT JOIN view_media_delivery_registry_current_records existing
      ON existing.media_delivery_registry_record_id = record.id
    ORDER BY authority.placement_id, authority.placement_revision, authority.image_id
  `)
  const { rows } = await write<
    Tuple & {
      existing_desired_state: 'allow' | 'withheld' | null
      desired_state: 'allow' | 'withheld'
    }
  >(statement)
  let staged = 0
  const page = rows.slice(0, limit)
  for (const record of page) {
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
