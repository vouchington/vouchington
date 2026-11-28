import { insertCopyrightActionIntents } from './action-intent-insertion.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  getImagePlacementsForCopyright,
  withholdImagePlacementsForCopyright,
} from '@services/images/placements'
import {
  lockImageDeliveryMutation,
  prepublishImagePlacementDenial,
} from '@services/media-delivery-safety'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'
import { getCopyrightSweepLimits } from './work-limits.mts'

/** A qualifying hold is governed by receipt time. Its later review cannot leave an already
 * restored tuple available: each target is fenced, denied, and given durable hold provenance. */
export async function activateLateCopyrightLegalHoldRestrictions(
  assessmentId: string,
  targetIds: string[],
  receivedAt: Date,
  transaction: TransactionQuery,
): Promise<string[]> {
  const { batchSize } = getCopyrightSweepLimits()
  const sortedTargetIds = targetIds.toSorted()
  const rows: Array<{ id: string; placement_id: string }> = []
  for (let offset = 0; offset < sortedTargetIds.length; offset += batchSize) {
    const chunk = sortedTargetIds.slice(offset, offset + batchSize)
    // oxlint-disable no-await-in-loop -- chunked late-hold activation runs sequentially within this transaction
    // no-mistakes-disable-next-line query-reached-per-item: chunked by DynamicConfig batch_size (hard max 100) over targetIds
    const { rows: chunkRows } = await transaction<{
      id: string
      placement_id: string
    }>(sql`
      /* activateLateCopyrightLegalHoldRestrictions */
      WITH prior AS (
        SELECT restriction.copyright_notice_target_id, restriction.authorizing_assessment_id,
          restriction.copyright_notice_submission_id, restriction.is_authorizing_assessment_automated
        FROM unnest(${chunk}::uuid[]) AS input_target(target_id)
        CROSS JOIN LATERAL (
          SELECT r.copyright_notice_target_id, r.authorizing_assessment_id,
            r.copyright_notice_submission_id, r.is_authorizing_assessment_automated
          FROM copyright_restrictions r
          WHERE r.copyright_notice_target_id = input_target.target_id
            AND r.lifted_at IS NOT NULL
            AND r.lifted_at >= ${receivedAt}
          ORDER BY r.imposed_at DESC, r.id DESC
          LIMIT 1
        ) restriction
        LIMIT ${batchSize}
      ), inserted AS (
        INSERT INTO copyright_restrictions (
          copyright_notice_target_id, authorizing_assessment_id, copyright_notice_submission_id,
          is_authorizing_assessment_automated, imposed_at, imposed_by_id,
          human_reviewed_at, human_review_action, human_reviewed_by_id
        ) SELECT target.id, prior.authorizing_assessment_id,
            CASE WHEN prior.authorizing_assessment_id IS NULL THEN
              (SELECT copyright_notice_submission_id FROM copyright_notice_legal_hold_assessments WHERE id = ${assessmentId})
              ELSE NULL END,
            prior.is_authorizing_assessment_automated, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL
        FROM prior JOIN copyright_notice_targets target ON target.id = prior.copyright_notice_target_id
        ORDER BY target.id ASC NULLS LAST
        LIMIT ${batchSize}
        ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
        RETURNING id, copyright_notice_target_id
      ), active_restrictions AS (
        SELECT inserted.id, inserted.copyright_notice_target_id
        FROM inserted
        UNION
        SELECT restriction.id, restriction.copyright_notice_target_id
        FROM unnest(${chunk}::uuid[]) AS input_target(target_id)
        CROSS JOIN LATERAL (
          SELECT r.id, r.copyright_notice_target_id
          FROM copyright_restrictions r
          WHERE r.copyright_notice_target_id = input_target.target_id
            AND r.lifted_at IS NULL
            AND (
              r.copyright_notice_submission_id IS NOT NULL
              OR EXISTS (
                SELECT 1 FROM copyright_legal_hold_restrictions hold_binding
                WHERE hold_binding.copyright_restriction_id = r.id
              )
            )
          LIMIT 1
        ) restriction
      ), bound AS (
        INSERT INTO copyright_legal_hold_restrictions (
          copyright_restriction_id, copyright_notice_legal_hold_assessment_id
        ) SELECT active.id, ${assessmentId} FROM active_restrictions active
        ORDER BY active.id ASC NULLS LAST
        ON CONFLICT ON CONSTRAINT copyright_legal_hold_restrictions_pkey DO NOTHING
      ) SELECT inserted.id, target.placement_id
        FROM inserted JOIN copyright_notice_targets target ON target.id = inserted.copyright_notice_target_id
        LIMIT ${batchSize}
    `)
    // oxlint-enable no-await-in-loop
    rows.push(...chunkRows)
  }
  if (rows.length === 0) return []
  assertMediaDeliveryLegalEnforcementEnabled()
  // Acquire all placement locks before reading revisions. Each denial uses one of those same
  // placement IDs and runs in the same transaction, which has already marked delivery authority started.
  await lockImageDeliveryMutation(transaction, {
    placementIds: rows.map(restriction => restriction.placement_id),
    placementOnly: true,
  })
  const placements = await getImagePlacementsForCopyright(
    rows.map(restriction => restriction.placement_id),
    { query: transaction },
  )
  const live = rows
    .flatMap(restriction => {
      const placement = placements.get(restriction.placement_id)
      return placement && !placement.deleted ? [{ restriction, placement }] : []
    })
    .toSorted((a, b) => a.placement.placementId.localeCompare(b.placement.placementId))
  // Targets of one notice can share a placement at different revisions; fence each placement once.
  const toWithhold = [
    ...new Map(
      live.flatMap(entry =>
        entry.placement.withheld ? [] : [[entry.placement.placementId, entry] as const],
      ),
    ).values(),
  ]
  for (const { placement } of toWithhold) {
    // oxlint-disable no-await-in-loop -- each edge denial is a conditional single-item DynamoDB write acknowledged under its own lease, in sorted placement order.
    // no-mistakes-disable-next-line query-reached-per-item: each edge denial is a conditional single-item DynamoDB write acknowledged under its own projection lease before PostgreSQL withholds the placement; the edge has no conditional batch write.
    await prepublishImagePlacementDenial(
      {
        placementId: placement.placementId,
        revision: placement.revision,
        imageId: placement.imageId,
      },
      { query: transaction, placementLocked: true },
    )
    // oxlint-enable no-await-in-loop
  }
  await withholdImagePlacementsForCopyright(
    toWithhold.map(({ restriction, placement }) => ({
      placementId: restriction.placement_id,
      expectedRevision: placement.revision,
    })),
    { query: transaction },
  )
  const intents = await insertCopyrightActionIntents(
    transaction,
    live.map(({ restriction, placement }) => ({
      restrictionId: restriction.id,
      placementRevision: placement.revision,
      action: 'withhold' as const,
    })),
  )
  return intents.map(intent => intent.id)
}
