import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reconcileUnauthorizedMediaDeliveryRecord } from '@services/media-delivery-safety/delivery-registry-denial-reconciliation'

/** A blocked restore may repair only its own tuple; current projection authority decides denial. */
export async function reconcilePreemptedCopyrightRestore(
  intentId: string,
  recordId: string,
): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* reconcilePreemptedCopyrightRestore */
    SELECT intent.id FROM copyright_notice_action_work_items intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
    JOIN media_delivery_registry_records record ON record.id = ${recordId}
      AND record.placement_id = target.placement_id AND record.image_id = image.image_id
      AND record.placement_revision IN (intent.expected_placement_revision, intent.expected_placement_revision + 1)
    WHERE intent.id = ${intentId} AND intent.action = 'restore' AND intent.state = 'blocked'
  `)
  if (!rows[0]) return
  await reconcileUnauthorizedMediaDeliveryRecord(recordId)
}
