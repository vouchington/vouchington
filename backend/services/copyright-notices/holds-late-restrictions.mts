import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { publishImagePlacementDeliveryRecord } from '@services/images/delivery-registry'
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
    publishPlacement?: typeof publishImagePlacementDeliveryRecord
  } = {},
): Promise<string[]> {
  const { rows } = await transaction<{
    id: string
    placement_key: string
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
      ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
      RETURNING id, copyright_notice_target_id
    ), bound AS (
      INSERT INTO copyright_legal_hold_restrictions (
        copyright_restriction_id, copyright_notice_legal_hold_assessment_id
      ) SELECT inserted.id, ${assessmentId} FROM inserted ON CONFLICT DO NOTHING
    ) SELECT inserted.id, target.placement_key
      FROM inserted JOIN copyright_notice_targets target ON target.id = inserted.copyright_notice_target_id
  `)
  if (rows.length > 0) {
    const assertEnabled =
      dependencies.assertLegalEnforcementEnabled ?? assertMediaDeliveryLegalEnforcementEnabled
    assertEnabled()
  }
  const publishPlacement = dependencies.publishPlacement ?? publishImagePlacementDeliveryRecord
  const intentIds = await Promise.all(
    rows.map(async restriction => {
      const placement = await getImagePlacementForCopyright(restriction.placement_key, {
        query: transaction,
      })
      if (!placement || placement.deleted) return null
      if (!placement.withheld) {
        await publishPlacement(
          {
            placementId: placement.placementId,
            revision: placement.revision,
            imageId: placement.imageId,
            state: 'withheld',
          },
          { query: transaction },
        )
        await withholdImagePlacementForCopyright(
          { placementKey: restriction.placement_key, expectedRevision: placement.revision },
          { query: transaction },
        )
      }
      const { rows: intentRows } = await transaction<{
        id: string
      }>(sql`/* activateLateCopyrightLegalHoldRestrictions:intent */
        INSERT INTO copyright_notice_action_intents (
          copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
        ) VALUES (${restriction.id}, NULL, ${placement.revision}, 'withhold')
        ON CONFLICT (copyright_restriction_id, expected_placement_revision, action)
        DO UPDATE SET updated_at = copyright_notice_action_intents.updated_at
        RETURNING id
      `)
      return intentRows[0]?.id ?? null
    }),
  )
  return intentIds.filter((id): id is string => id !== null)
}
