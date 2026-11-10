import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'

type StageInput = {
  placementId: string
  revision: number
  imageId: string
  state: MediaDeliveryRegistryState
}
type StagedRecord = { mediaDeliveryRegistryRecordId: string; generation: string }
type StagedRow = {
  id: string
  generation: string
  placement_id: string
  placement_revision: number
  image_id: string
}

const stagedKey = (placementId: string, revision: number, imageId: string) =>
  `${placementId}:${revision}:${imageId}`

/**
 * Stages every tuple in one statement and returns the records keyed by
 * `placementId:revision:imageId`. Duplicate tuples collapse to the last requested state.
 */
export async function stageImagePlacementDeliveryRecords(
  inputs: readonly StageInput[],
  options: QueryOptions & { forceGeneration?: boolean } = {},
): Promise<Map<string, StagedRecord>> {
  const query = options.query ?? write
  const forceGeneration = options.forceGeneration ?? false
  const unique = new Map<string, StageInput>()
  for (const input of inputs)
    unique.set(stagedKey(input.placementId, input.revision, input.imageId), input)
  const tuples = [...unique.values()].toSorted((a, b) =>
    stagedKey(a.placementId, a.revision, a.imageId).localeCompare(
      stagedKey(b.placementId, b.revision, b.imageId),
    ),
  )
  const staged = new Map<string, StagedRecord>()
  if (tuples.length === 0) return staged
  const placementIds = tuples.map(tuple => tuple.placementId)
  const revisions = tuples.map(tuple => tuple.revision)
  const imageIds = tuples.map(tuple => tuple.imageId)
  const record = (row: StagedRow) =>
    staged.set(stagedKey(row.placement_id, row.placement_revision, row.image_id), {
      mediaDeliveryRegistryRecordId: row.id,
      generation: row.generation,
    })
  const { rows } = await query<StagedRow>(sql`/* stageImagePlacementDeliveryRecords */
    INSERT INTO media_delivery_registry_records (
      placement_id, placement_revision, image_id, desired_state
    ) SELECT * FROM unnest(${placementIds}::uuid[], ${revisions}::integer[], ${imageIds}::uuid[],
      ${tuples.map(tuple => tuple.state)}::media_delivery_desired_states[])
    ORDER BY 1, 2, 3
    ON CONFLICT (placement_id, placement_revision, image_id) DO UPDATE
    SET desired_state = EXCLUDED.desired_state,
      generation = CASE WHEN ${forceGeneration} THEN media_delivery_registry_records.generation + 1
        ELSE media_delivery_registry_records.generation END
    WHERE media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
      OR ${forceGeneration}
    RETURNING id, generation, placement_id, placement_revision, image_id
  `)
  for (const row of rows) record(row)
  if (staged.size === tuples.length) return staged
  const { rows: currentRows } = await query<StagedRow>(sql`
    /* stageImagePlacementDeliveryRecords:current */
    SELECT registry.id, registry.generation, registry.placement_id, registry.placement_revision,
      registry.image_id
    FROM unnest(${placementIds}::uuid[], ${revisions}::integer[], ${imageIds}::uuid[])
      requested(placement_id, placement_revision, image_id)
    JOIN media_delivery_registry_records registry
      ON registry.placement_id = requested.placement_id
      AND registry.placement_revision = requested.placement_revision
      AND registry.image_id = requested.image_id
  `)
  for (const row of currentRows)
    if (!staged.has(stagedKey(row.placement_id, row.placement_revision, row.image_id))) record(row)
  return staged
}

export async function stageImagePlacementDeliveryRecord(
  input: StageInput,
  options: QueryOptions & { forceGeneration?: boolean } = {},
): Promise<StagedRecord> {
  const staged = await stageImagePlacementDeliveryRecords([input], options)
  return staged.get(stagedKey(input.placementId, input.revision, input.imageId))!
}
