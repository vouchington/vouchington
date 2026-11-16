import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Read only the current placement tuple and its trigger-owned durable projection work. */
export async function readCopyrightFilingProjection(placementId: string) {
  const { rows } = await read<{
    id: string
    placement_revision: number
    desired_state: string
    state: string
  }>(sql`/* readCopyrightFilingProjection */
    SELECT registry.media_delivery_registry_record_id AS id, registry.placement_revision,
      registry.desired_state, registry.state
    FROM media_placements placement
    JOIN view_media_delivery_registry_current_records registry
      ON registry.placement_id = placement.id AND registry.placement_revision = placement.revision
    WHERE placement.id = ${placementId}
  `)
  return rows
}
