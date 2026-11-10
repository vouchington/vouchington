import { withTransactionSavepoint } from '@data-stores/psql/transaction-savepoint'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { mediaDeliverySafetyWorkMaxValues } from './work-limits.mts'
import { prepublishImagePlacementDenialBatch } from './delivery-registry-publish.mts'

type PolicyPlacement = { placement_id: string; revision: number }

/** Copy the image's eligibility onto its active placements, then deny the ones that are no longer eligible. */
export async function writeImageDeliveryPolicyMutation<Result>(
  query: TransactionQuery,
  imageId: string,
  writeImage: (scope: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const settled = await withTransactionSavepoint(query, async scope => {
    const result = await writeImage(scope)
    const { rows } = await scope<{
      is_delivery_eligible: boolean
    }>(sql`/* writeImagePolicy:current */
      SELECT is_delivery_eligible FROM images WHERE id = ${imageId}`)
    const eligible = rows[0]?.is_delivery_eligible ?? false
    const max = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
    // Bound ids. Joining them inside this UPDATE is planned as a sequential scan.
    const { rows: placements } = await scope<PolicyPlacement>(sql`/* writeImagePolicy:denials */
      SELECT active.id AS placement_id, active.revision
      FROM retained_image_placement_bindings binding
      JOIN LATERAL (
        SELECT placement.id, placement.revision
        FROM media_placements placement
        WHERE placement.id = binding.placement_id
          AND placement.retired_at IS NULL
        LIMIT 1
      ) active ON true
      WHERE binding.image_id = ${imageId}
      ORDER BY active.id
      LIMIT ${max}`)
    await scope(sql`/* writeImagePolicy:placements */
      UPDATE media_placements
      SET is_current_image_delivery_eligible = ${eligible}
      WHERE id = ANY(${placements.map(placement => placement.placement_id)}::uuid[])
        AND is_current_image_delivery_eligible IS DISTINCT FROM ${eligible}`)
    return { result, eligible, placements }
  })
  if (!settled.eligible)
    await prepublishImagePlacementDenialBatch(
      settled.placements.map(row => ({
        placementId: row.placement_id,
        revision: row.revision,
        imageId,
      })),
      { query },
    )
  return settled.result
}
