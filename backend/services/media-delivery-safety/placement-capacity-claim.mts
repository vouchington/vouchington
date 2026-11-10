import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ImagePlacementCapacityReservation,
  ImagePlacementCapacityClaimResult,
} from './placement-capacity-types.mts'
import { mediaDeliverySafetyWorkMaxValues } from './work-limits.mts'

/** Discover and claim every incoming image in one bounded statement. */
export async function claimImagePlacementReservations(
  query: TransactionQuery,
  reservations: readonly ImagePlacementCapacityReservation[],
  cap: number,
): Promise<ImagePlacementCapacityClaimResult> {
  if (reservations.length === 0) return 'complete'
  const { rows } = await query<{
    result: ImagePlacementCapacityClaimResult
  }>(sql`/* claimImagePlacementReservations */
    WITH requested AS MATERIALIZED (
      SELECT * FROM unnest(${reservations.map(row => row.placementId)}::uuid[],
        ${reservations.map(row => row.imageId)}::uuid[],
        ${reservations.map(row => row.bindingFamily)}::image_binding_families[],
        ${reservations.map(row => row.activationRevision)}::integer[],
        ${reservations.map(row => row.postId ?? null)}::uuid[])
        input(placement_id, image_id, binding_family, activation_revision, post_id)
    ), missing AS MATERIALIZED (
      SELECT requested.*, row_number() OVER (
        PARTITION BY requested.image_id ORDER BY requested.placement_id
      ) AS ordinal
      FROM requested
      LEFT JOIN LATERAL (
        SELECT placement_id, image_id, binding_family, activation_revision, post_id
        FROM image_placement_capacity_reservations
        WHERE placement_id = requested.placement_id LIMIT 1
      ) existing ON true
      WHERE existing.placement_id IS NULL
        OR existing.image_id <> requested.image_id
        OR existing.binding_family <> requested.binding_family
        OR existing.activation_revision <> requested.activation_revision
        OR existing.post_id IS DISTINCT FROM requested.post_id
    ), image_needs AS MATERIALIZED (
      SELECT image_id, count(*)::integer AS missing_count FROM missing GROUP BY image_id
    ), image_slots AS MATERIALIZED (
      SELECT image_needs.*, ARRAY(
        SELECT slot_number FROM image_placement_capacity_reservations
        WHERE image_id = image_needs.image_id ORDER BY slot_number LIMIT ${cap + 1}
      ) AS occupied
      FROM image_needs
    ), free_slots AS MATERIALIZED (
      SELECT image.image_id, free.slot_number, free.ordinal
      FROM image_slots image
      CROSS JOIN LATERAL (
        SELECT slot_number, row_number() OVER (ORDER BY slot_number) AS ordinal
        FROM generate_series(1, ${mediaDeliverySafetyWorkMaxValues.max_placements_per_image}) slot_number
        WHERE slot_number <> ALL(image.occupied)
        ORDER BY slot_number LIMIT image.missing_count
      ) free
      WHERE cardinality(image.occupied) + image.missing_count <= ${cap}
    ), inserted AS (
      INSERT INTO image_placement_capacity_reservations (
        placement_id, image_id, binding_family, activation_revision, slot_number,
        post_placement_id, surface_placement_id, post_id, is_current_image_delivery_eligible
      ) SELECT missing.placement_id, missing.image_id, missing.binding_family,
        missing.activation_revision, free.slot_number,
        CASE WHEN missing.binding_family = 'post' THEN missing.placement_id END,
        CASE WHEN missing.binding_family = 'surface' THEN missing.placement_id END,
        missing.post_id, image.is_delivery_eligible
      FROM missing
      JOIN free_slots free ON free.image_id = missing.image_id AND free.ordinal = missing.ordinal
      JOIN images image ON image.id = missing.image_id
      WHERE NOT EXISTS (SELECT 1 FROM image_slots
        WHERE cardinality(occupied) + missing_count > ${cap})
      ORDER BY missing.image_id ASC NULLS LAST, free.slot_number ASC NULLS LAST
      ON CONFLICT (image_id, slot_number) DO NOTHING RETURNING placement_id
    ) SELECT CASE
      WHEN EXISTS (SELECT 1 FROM image_slots WHERE cardinality(occupied) + missing_count > ${cap})
        THEN 'capacity_exceeded'
      WHEN (SELECT count(*) FROM missing) = (SELECT count(*) FROM inserted) THEN 'complete'
      ELSE 'conflict' END AS result`)
  return rows[0]!.result
}
