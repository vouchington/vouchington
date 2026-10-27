import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

/**
 * Deletes one page of old, superseded, unreferenced delivery transitions, except those of a
 * placement whose party is under legal-process preservation. Parties are the ones copyright
 * retention uses, so an open hold keeps its transitions and a released hold keeps them until the
 * retention window has passed again from its release.
 */
export async function deleteMediaDeliveryChangePage(
  query: TransactionQuery,
  ids: readonly string[],
  upperBound: string,
  cutoff: Date,
): Promise<number> {
  const statement = sql`/* deleteMediaDeliveryChangePage */
    DELETE FROM media_delivery_registry_changes history
    WHERE history.id = ANY(${ids}::uuid[])
      AND history.id < ${upperBound}::uuid
      AND (history.completed_at IS NULL OR history.completed_at < ${cutoff}::timestamptz)
      AND NOT (history.change_type = 'completed' AND history.desired_state = 'withheld')
      AND NOT EXISTS (SELECT 1 FROM media_delivery_registry_records record
        WHERE record.latest_change_id = history.id)
      AND NOT EXISTS (SELECT 1 FROM media_delivery_registry_projection_work_items work
        WHERE work.failed_change_id = history.id)
      AND NOT EXISTS (
        SELECT 1 FROM media_delivery_registry_records owner
        CROSS JOIN LATERAL (
          SELECT owner.placement_id AS placement_id,
            owner.placement_revision AS surface_activation_revision,
            (SELECT COALESCE(surface.user_id, link.user_id)
              FROM image_surface_placements surface
              LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
              WHERE surface.placement_id = owner.placement_id) AS surface_owner_user_id
        ) target
        CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('retain'))
  statement.append(sql` party
        JOIN user_legal_preservation_holds hold ON hold.account_user_id = party.user_id
        WHERE owner.id = history.media_delivery_registry_record_id
          AND (hold.released_at IS NULL OR hold.released_at >= ${cutoff}::timestamptz)
      )`)
  const { rowCount } = await query(statement)
  return rowCount ?? 0
}
