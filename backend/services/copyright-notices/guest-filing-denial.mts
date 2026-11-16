import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { preemptCopyrightRestorations } from './restore-preemption.mts'
import { imposeCopyrightCourtFilingRestrictions } from './court-filing-restrictions.mts'
import { stageImagePlacementDeliveryRecords } from '@services/media-delivery-safety/delivery-registry-staging'

/** Persist the admitted court filing's work, placement withholding and durable edge projection. */
export async function applyCopyrightCourtFiling(
  noticeId: string,
  submissionId: string,
  receivedAt: Date,
  query: TransactionQuery,
) {
  await preemptCopyrightRestorations(noticeId, query)
  const withholdIds = await imposeCopyrightCourtFilingRestrictions(
    noticeId,
    submissionId,
    receivedAt,
    query,
  )
  return { withholdIds, denialRecordIds: await stageCopyrightCourtFilingDenials(noticeId, query) }
}

/** A court filing and its current target-tuple denials become durable together. */
export async function stageCopyrightCourtFilingDenials(
  noticeId: string,
  query: TransactionQuery,
): Promise<string[]> {
  const { rows: current } = await query<{
    placement_id: string
    revision: number
    image_id: string
  }>(sql`/* denyCopyrightCourtFilingPlacements:current */
    SELECT placement.id AS placement_id, placement.revision, binding.image_id
    FROM copyright_notice_targets target
    JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
    JOIN retained_image_placement_bindings binding ON binding.placement_id = target.placement_id
      AND binding.image_id = image.image_id
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY placement.id, placement.revision, binding.image_id
  `)
  const staged = await stageImagePlacementDeliveryRecords(
    current.map(row => ({
      placementId: row.placement_id,
      revision: row.revision,
      imageId: row.image_id,
      state: 'withheld' as const,
    })),
    { query, forceGeneration: true },
  )
  return [...staged.values()].map(record => record.mediaDeliveryRegistryRecordId)
}
