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

/** A qualifying hold is governed by receipt time. Its later review cannot leave an already
 * restored tuple available: each target is fenced, denied, and given durable hold provenance. */
export async function activateLateCopyrightLegalHoldRestrictions(
  assessmentId: string,
  targetIds: string[],
  receivedAt: Date,
  transaction: TransactionQuery,
  dependencies: {
    assertLegalEnforcementEnabled?: typeof assertMediaDeliveryLegalEnforcementEnabled
    publishPlacement?: typeof prepublishImagePlacementDenial
  } = {},
): Promise<string[]> {
  const { rows } = await transaction<{
    id: string
    placement_id: string
  }>(sql`
    /* activateLateCopyrightLegalHoldRestrictions */
    WITH prior AS (
      SELECT DISTINCT ON (restriction.copyright_notice_target_id)
        restriction.copyright_notice_target_id, restriction.authorizing_assessment_id
      FROM copyright_restrictions restriction
      WHERE restriction.copyright_notice_target_id = ANY(${targetIds}::uuid[])
        AND restriction.lifted_at IS NOT NULL
        AND restriction.lifted_at >= ${receivedAt}
      ORDER BY restriction.copyright_notice_target_id, restriction.imposed_at DESC, restriction.id DESC
    ), inserted AS (
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id,
        human_reviewed_at, human_review_action, human_reviewed_by_id
      ) SELECT target.id, prior.authorizing_assessment_id, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL
      FROM copyright_notice_targets target JOIN prior ON prior.copyright_notice_target_id = target.id
      WHERE target.id = ANY(${targetIds}::uuid[])
      ORDER BY target.id ASC NULLS LAST
      ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
      RETURNING id, copyright_notice_target_id
    ), active_restrictions AS (
      SELECT inserted.id, inserted.copyright_notice_target_id
      FROM inserted
      UNION
      SELECT restriction.id, restriction.copyright_notice_target_id
      FROM copyright_restrictions restriction
      WHERE restriction.copyright_notice_target_id = ANY(${targetIds}::uuid[])
        AND restriction.lifted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM copyright_legal_hold_restrictions hold_binding
          WHERE hold_binding.copyright_restriction_id = restriction.id
        )
    ), bound AS (
      INSERT INTO copyright_legal_hold_restrictions (
        copyright_restriction_id, copyright_notice_legal_hold_assessment_id
      ) SELECT active.id, ${assessmentId} FROM active_restrictions active
      ORDER BY active.id ASC NULLS LAST
      ON CONFLICT ON CONSTRAINT copyright_legal_hold_restrictions_pkey DO NOTHING
    ) SELECT inserted.id, target.placement_id
      FROM inserted JOIN copyright_notice_targets target ON target.id = inserted.copyright_notice_target_id
  `)
  if (rows.length > 0) {
    const assertEnabled =
      dependencies.assertLegalEnforcementEnabled ?? assertMediaDeliveryLegalEnforcementEnabled
    assertEnabled()
  }
  if (rows.length === 0) return []
  const publishPlacement = dependencies.publishPlacement ?? prepublishImagePlacementDenial
  // One sorted acquisition for every placement, before any revision is read. The per-placement
  // lock inside publishPlacement re-enters these locks (advisory xact locks and row locks are
  // re-entrant), so it adds no new lock order.
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
    await publishPlacement(
      {
        placementId: placement.placementId,
        revision: placement.revision,
        imageId: placement.imageId,
      },
      { query: transaction },
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
