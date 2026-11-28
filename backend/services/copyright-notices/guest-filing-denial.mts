import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { collectKeysetPages } from './bounded-reads.mts'
import { preemptCopyrightRestorations } from './restore-preemption.mts'
import { imposeCopyrightCourtFilingRestrictions } from './court-filing-restrictions.mts'
import { stageImagePlacementDeliveryRecords } from '@services/media-delivery-safety/delivery-registry-staging'
import { getCopyrightSweepLimits } from './work-limits.mts'

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
  type DenialTargetRow = {
    target_id: string
    placement_id: string
    revision: number
    image_id: string
  }
  const current = await collectKeysetPages<DenialTargetRow, string>(
    getCopyrightSweepLimits().batchSize,
    async (afterTargetId, limit) => {
      const { rows } =
        await query<DenialTargetRow>(sql`/* denyCopyrightCourtFilingPlacements:current */
        SELECT target.id AS target_id, placement.id AS placement_id, placement.revision, binding.image_id
        FROM copyright_notice_targets target
        JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
        JOIN retained_image_placement_bindings binding ON binding.placement_id = target.placement_id
          AND binding.image_id = image.image_id
        JOIN media_placements placement ON placement.id = binding.placement_id
        WHERE target.copyright_notice_id = ${noticeId}
          AND (${afterTargetId}::uuid IS NULL OR target.id > ${afterTargetId}::uuid)
        ORDER BY target.id ASC
        LIMIT ${limit}
      `)
      return rows
    },
    row => row.target_id,
  )
  current.sort(
    (a, b) =>
      a.placement_id.localeCompare(b.placement_id) ||
      a.revision - b.revision ||
      a.image_id.localeCompare(b.image_id),
  )
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
