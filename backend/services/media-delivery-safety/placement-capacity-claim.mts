import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ImagePlacementCapacityReservation } from './placement-capacity-types.mts'
import { mediaDeliverySafetyWorkMaxValues } from './work-limits.mts'

export async function claimImagePlacementReservations(
  query: TransactionQuery,
  reservations: readonly ImagePlacementCapacityReservation[],
  cap: number,
): Promise<boolean> {
  if (reservations.length === 0) return true
  const imageId = reservations[0]!.imageId.toLowerCase()
  const { rows: existing } = await query<{
    placement_id: string
    image_id: string
    binding_family: 'post' | 'surface'
    activation_revision: number
    post_id: string | null
  }>(sql`/* claimImagePlacementReservations:existing */
    SELECT placement_id, image_id, binding_family, activation_revision, post_id
    FROM image_placement_capacity_reservations
    WHERE placement_id = ANY(${reservations.map(row => row.placementId)}::uuid[])
    ORDER BY placement_id`)
  const existingById = new Map(existing.map(row => [row.placement_id, row]))
  const missing = reservations
    .filter(requested => {
      const row = existingById.get(requested.placementId.toLowerCase())
      return (
        !row ||
        row.image_id !== imageId ||
        row.binding_family !== requested.bindingFamily ||
        row.activation_revision !== requested.activationRevision ||
        row.post_id !== (requested.postId?.toLowerCase() ?? null)
      )
    })
    .toSorted((a, b) => a.placementId.toLowerCase().localeCompare(b.placementId.toLowerCase()))
  // Exact existing activations remain idempotent even after an operator lowers the cap.
  if (missing.length === 0) return true
  const { rows: occupied } = await query<{
    slot_number: number
  }>(sql`/* claimImagePlacementReservations:occupied */
    SELECT slot_number FROM image_placement_capacity_reservations
    WHERE image_id = ${imageId} ORDER BY slot_number LIMIT ${cap + 1}`)
  if (occupied.length >= cap || missing.length > cap - occupied.length) return false
  // Since N < cap, this capped read contains the complete occupied set, including high slots.
  const occupiedSlots = new Set(occupied.map(row => row.slot_number))
  const freeSlots: number[] = []
  const budget = cap - occupied.length
  for (
    let slot = 1;
    slot <= mediaDeliverySafetyWorkMaxValues.max_placements_per_image && freeSlots.length < budget;
    slot++
  ) {
    if (!occupiedSlots.has(slot)) freeSlots.push(slot)
  }
  const { rows: inserted } = await query<{
    placement_id: string
  }>(sql`/* claimImagePlacementReservations:insert */
    INSERT INTO image_placement_capacity_reservations (
      placement_id, image_id, binding_family, activation_revision, slot_number,
      post_placement_id, surface_placement_id, post_id, is_current_image_delivery_eligible
    ) SELECT requested.placement_id, image.id, requested.binding_family,
      requested.activation_revision, requested.slot_number,
      CASE WHEN requested.binding_family = 'post' THEN requested.placement_id END,
      CASE WHEN requested.binding_family = 'surface' THEN requested.placement_id END,
      requested.post_id, image.is_delivery_eligible
    FROM unnest(${missing.map(row => row.placementId)}::uuid[],
      ${missing.map(row => row.bindingFamily)}::image_binding_families[],
      ${missing.map(row => row.activationRevision)}::integer[],
      ${missing.map((_, index) => freeSlots[index]!)}::integer[],
      ${missing.map(row => row.postId ?? null)}::uuid[])
      AS requested(placement_id, binding_family, activation_revision, slot_number, post_id)
    JOIN images image ON image.id = ${imageId}
    ORDER BY image.id ASC NULLS LAST, requested.slot_number ASC NULLS LAST
    ON CONFLICT (image_id, slot_number) DO NOTHING RETURNING placement_id`)
  return inserted.length === missing.length
}
