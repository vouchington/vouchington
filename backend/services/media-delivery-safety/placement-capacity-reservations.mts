import { withTransactionSavepoint } from '@data-stores/psql/transaction-savepoint'
import type { TransactionQuery } from '@data-stores/psql/types'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'

import type { ImagePlacementAdmission } from './placement-capacity-types.mts'
export type { ImagePlacementAdmission } from './placement-capacity-types.mts'

/** One savepoint so a later provider failure rolls the placement write back. Settlement is not retried. */
export async function withImagePlacementMutation<Plan, Result>(
  query: TransactionQuery,
  mutate: (scope: TransactionQuery) => Promise<Plan>,
  settle: (plan: Plan, scope: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  return withTransactionSavepoint(query, async scope => {
    const plan = await mutate(scope)
    return settle(plan, scope)
  })
}

/**
 * Best-effort cap: read at most cap+1 other active placements, then the caller writes.
 * A race can pass this read and exceed the cap. An already-active placement is not a new admission.
 */
export async function admitImagePlacements(
  query: TransactionQuery,
  admissions: readonly ImagePlacementAdmission[],
): Promise<void> {
  if (admissions.length === 0) return
  const byImage = new Map<string, number>()
  const excluded: string[] = []
  for (const admission of admissions) {
    const imageId = admission.imageId.toLowerCase()
    byImage.set(imageId, (byImage.get(imageId) ?? 0) + (admission.alreadyActive ? 0 : 1))
    if (admission.placementId) excluded.push(admission.placementId)
  }
  const imageIds = [...byImage.keys()]
  const newCounts = imageIds.map(imageId => byImage.get(imageId)!)
  const cap = getMediaDeliverySafetyWorkLimit('max_placements_per_image')
  const { rows } = await query<{ image_id: string }>(sql`/* countImagePlacementOccupancy */
    SELECT requested.image_id
    FROM unnest(${imageIds}::uuid[], ${newCounts}::integer[]) AS requested(image_id, new_count)
    JOIN LATERAL (
      SELECT binding.placement_id
      -- no-mistakes-disable-next-line postgres-required-predicates: the image id is the lookup key; placement_id partitions the table and is what this count is finding
      FROM retained_image_placement_bindings binding
      JOIN LATERAL (
        SELECT placement.id
        FROM media_placements placement
        WHERE placement.id = binding.placement_id
          AND placement.retired_at IS NULL
        LIMIT 1
      ) active ON true
      WHERE binding.image_id = requested.image_id
        AND binding.placement_id <> ALL(${excluded}::uuid[])
      LIMIT ${cap + 1}
    ) occupied ON true`)
  const occupied = new Map<string, number>()
  for (const row of rows) {
    const imageId = row.image_id.toLowerCase()
    occupied.set(imageId, (occupied.get(imageId) ?? 0) + 1)
  }
  for (const imageId of imageIds) {
    const fresh = byImage.get(imageId)!
    if (fresh > 0 && fresh + (occupied.get(imageId) ?? 0) > cap) throw capacityLimitError()
  }
}

function capacityLimitError() {
  return createCodedError(409, 'Image placement limit reached', IMAGE_PLACEMENT_LIMIT_REACHED)
}
