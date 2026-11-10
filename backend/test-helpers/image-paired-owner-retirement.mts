import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ImageSurfaceMutation,
  ImageSurfaceMutationWrite,
} from '../services/media-delivery-safety/surface-mutation.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '../services/media-delivery-safety/surface-mutation-bindings.mts'

type ImageColumn = 'profile_image_id' | 'banner_image_id' | 'logo_image_id' | 'hero_image_id'
type OwnerIdColumn = 'community_id' | 'topic_id'
type OwnerTable = 'communities' | 'topics'
type SurfaceSlot = { surfaceKind: string; imageColumn: ImageColumn }

type RetiredPair = {
  owner_id: string
  previous_primary_image_id: string | null
  previous_secondary_image_id: string | null
  current_primary_image_id: string | null
  current_secondary_image_id: string | null
  previous_primary_placement_id: string | null
  previous_primary_placement_revision: number | null
  previous_primary_activation_revision: number | null
  previous_secondary_placement_id: string | null
  previous_secondary_placement_revision: number | null
  previous_secondary_activation_revision: number | null
}

const ownerIdSql = (column: OwnerIdColumn) =>
  column === 'community_id' ? sql`community_id` : sql`topic_id`
const tableSql = (table: OwnerTable) => (table === 'communities' ? sql`communities` : sql`topics`)
const imageColumnSql = (column: ImageColumn) => {
  switch (column) {
    case 'profile_image_id':
      return sql`profile_image_id`
    case 'banner_image_id':
      return sql`banner_image_id`
    case 'logo_image_id':
      return sql`logo_image_id`
    case 'hero_image_id':
      return sql`hero_image_id`
  }
}

/** Retires one owner that carries two image columns, confirming both still match the preimage. */
export async function retireTestPairedImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  options: {
    annotation: string
    table: OwnerTable
    ownerIdColumn: OwnerIdColumn
    surfaces: readonly [SurfaceSlot, SurfaceSlot]
    requireUnmerged: boolean
    ownerIdOf: (reference: ImageSurfaceMutation) => string
    changedError: string
  },
): Promise<ImageSurfaceMutationWrite<void>> {
  const table = tableSql(options.table)
  const ownerId = ownerIdSql(options.ownerIdColumn)
  const [primary, secondary] = options.surfaces
  const statement = imageSurfaceMutationPreimage(references, options.annotation)
  statement
    .append(sql`, retired AS (UPDATE `)
    .append(table)
    .append(sql` SET `)
    .append(setClause)
  statement
    .append(sql` FROM (SELECT DISTINCT `)
    .append(ownerId)
    .append(sql` FROM surface_preimage) owner_preimage WHERE `)
    .append(table)
    .append(sql`.id = owner_preimage.`)
    .append(ownerId)
  for (const surface of options.surfaces) {
    statement
      .append(sql` AND `)
      .append(table)
      .append(sql`.`)
      .append(imageColumnSql(surface.imageColumn))
      .append(
        sql` IS NOT DISTINCT FROM (SELECT current_image_id FROM surface_preimage preimage WHERE preimage.`,
      )
      .append(ownerId)
      .append(sql` = `)
      .append(table)
      .append(sql`.id AND preimage.surface_kind = ${surface.surfaceKind})`)
  }
  const live = (column: ImageColumn) => {
    const image = sql`current.`.append(imageColumnSql(column))
    return options.requireUnmerged
      ? sql`CASE WHEN current.deleted_at IS NULL AND current.merged_into_topic_id IS NULL THEN `
          .append(image)
          .append(sql` END`)
      : sql`CASE WHEN current.deleted_at IS NULL THEN `.append(image).append(sql` END`)
  }
  const previousPlacement = (surface: SurfaceSlot, field: string) =>
    sql`(SELECT `
      .append(field)
      .append(sql` FROM surface_preimage preimage WHERE preimage.`)
      .append(ownerId)
      .append(sql` = prior.id AND preimage.surface_kind = ${surface.surfaceKind})`)
  statement
    .append(sql` RETURNING WITH (OLD AS prior, NEW AS current) prior.id AS owner_id, prior.`)
    .append(imageColumnSql(primary.imageColumn))
    .append(sql` AS previous_primary_image_id, prior.`)
    .append(imageColumnSql(secondary.imageColumn))
    .append(sql` AS previous_secondary_image_id, `)
    .append(live(primary.imageColumn))
    .append(sql` AS current_primary_image_id, `)
    .append(live(secondary.imageColumn))
    .append(sql` AS current_secondary_image_id, `)
    .append(previousPlacement(primary, 'placement_id'))
    .append(sql` AS previous_primary_placement_id, `)
    .append(previousPlacement(primary, 'placement_revision'))
    .append(sql` AS previous_primary_placement_revision, `)
    .append(previousPlacement(primary, 'activation_revision'))
    .append(sql` AS previous_primary_activation_revision, `)
    .append(previousPlacement(secondary, 'placement_id'))
    .append(sql` AS previous_secondary_placement_id, `)
    .append(previousPlacement(secondary, 'placement_revision'))
    .append(sql` AS previous_secondary_placement_revision, `)
    .append(previousPlacement(secondary, 'activation_revision'))
    .append(sql` AS previous_secondary_activation_revision ) SELECT * FROM retired`)
  const { rows } = await query<RetiredPair>(statement)
  const byOwnerId = new Map(rows.map(row => [row.owner_id, row]))
  if (byOwnerId.size !== new Set(references.map(options.ownerIdOf)).size)
    throw new Error(options.changedError)
  return {
    result: undefined,
    changes: references.map((reference, index) => {
      const row = byOwnerId.get(options.ownerIdOf(reference))!
      const primarySlot = reference.surfaceKind === primary.surfaceKind
      return imageSurfaceMutationChange(
        primarySlot
          ? {
              ordinality: index + 1,
              previousImageId: row.previous_primary_image_id,
              currentImageId: row.current_primary_image_id,
              previousPlacementId: row.previous_primary_placement_id,
              previousPlacementRevision: row.previous_primary_placement_revision,
              previousActivationRevision: row.previous_primary_activation_revision,
            }
          : {
              ordinality: index + 1,
              previousImageId: row.previous_secondary_image_id,
              currentImageId: row.current_secondary_image_id,
              previousPlacementId: row.previous_secondary_placement_id,
              previousPlacementRevision: row.previous_secondary_placement_revision,
              previousActivationRevision: row.previous_secondary_activation_revision,
            },
      )
    }),
  }
}
