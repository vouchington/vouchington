import { read, write } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightPlacementHostIsLiveSql } from './placement-copyright-host-sql.mts'
import { buildCopyrightPlacementsMutationSql } from './placement-copyright-mutation-sql.mts'
import {
  toCopyrightImagePlacement,
  type CopyrightImagePlacement,
  type CopyrightImagePlacementRow,
} from './placement-copyright-types.mts'

export { getImagePlacementCopyrightOwner } from './placement-owner.mts'

export type { CopyrightImagePlacement } from './placement-copyright-types.mts'

export type CopyrightImagePlacementMutation =
  | { status: 'applied' | 'already_applied'; placement: CopyrightImagePlacement }
  | { status: 'stale' | 'deleted'; placement: CopyrightImagePlacement }
  | { status: 'not_found' }

export function getImagePlacementKey(placementId: string): string {
  return `image-placement:${placementId}`
}

export async function retireImagePlacementsForDeletedImage(
  imageId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    sql`/* retireImagePlacementsForDeletedImage */
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      FROM image_placements image_placement
      WHERE image_placement.placement_id = placement.id
        AND image_placement.image_id = ${imageId}
        AND placement.retired_at IS NULL
    `,
  )
}

export async function getImagePlacementForCopyright(
  placementId: string,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacement | null> {
  return (await getImagePlacementsForCopyright([placementId], options)).get(placementId) ?? null
}

/** Reads many placements in one statement. Placements that do not exist are absent from the map. */
export async function getImagePlacementsForCopyright(
  placementIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, CopyrightImagePlacement>> {
  if (placementIds.length === 0) return new Map()
  const query = options.query ?? read
  const statement = buildCopyrightPlacementReadSql([...placementIds])
  const select = (execute: QueryExecutor) =>
    execute<CopyrightImagePlacementRow>(
      `/* getImagePlacementsForCopyright */\n    SELECT ${statement.text}`,
      statement.values,
    )
  const { rows } = await select(query)
  // PostgreSQL returns canonical lowercase UUIDs, but a caller may spell the id in uppercase.
  const found = new Map(rows.map(row => [row.placement_id, toCopyrightImagePlacement(row)]))
  return new Map(
    placementIds.flatMap(id => {
      const placement = found.get(id.toLowerCase())
      return placement ? [[id, placement] as const] : []
    }),
  )
}

function buildCopyrightPlacementReadSql(placementIds: string[]): ReturnType<typeof sql> {
  const statement = sql`placement.id AS placement_id, placement.revision, binding.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.is_flagged_by_openai_omni_moderation AS image_moderation_flagged, `
  statement.append(copyrightPlacementHostIsLiveSql())
  statement.append(sql` AS host_live
    FROM media_placements placement
    JOIN retained_image_placement_bindings binding ON binding.placement_id = placement.id
    JOIN images image ON image.id = binding.image_id
    LEFT JOIN image_placements post_binding ON post_binding.placement_id = placement.id
    LEFT JOIN posts post ON post.id = post_binding.post_id
    LEFT JOIN image_surface_placements surface ON surface.placement_id = placement.id
    WHERE placement.id = ANY(${placementIds}::uuid[])
  `)
  return statement
}

export type CopyrightImagePlacementMutationInput = {
  placementId: string
  expectedRevision: number
}

/** Changes many placements in one statement; result order matches input order.
 * Caller must hold `lockImageDeliveryMutation({ placementIds, placementOnly: true })` for every
 * input placement in this transaction. */
export async function changeImagePlacementsCopyrightWithholding(
  inputs: readonly CopyrightImagePlacementMutationInput[],
  withhold: boolean,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation[]> {
  if (inputs.length === 0) return []
  const placementIds = inputs.map(input => input.placementId.toLowerCase())
  if (new Set(placementIds).size !== inputs.length) {
    throw new Error('changeImagePlacementsCopyrightWithholding: duplicate placementId')
  }
  const query = options.query ?? write
  const { rows } = await query<CopyrightImagePlacementRow>(
    buildCopyrightPlacementsMutationSql(
      placementIds,
      inputs.map(input => input.expectedRevision),
      withhold,
    ),
  )
  const applied = new Map(
    rows.map(row => [row.placement_id.toLowerCase(), toCopyrightImagePlacement(row)]),
  )
  const missingIds = placementIds.filter(placementId => !applied.has(placementId))
  const current =
    missingIds.length === 0
      ? new Map<string, CopyrightImagePlacement>()
      : await getImagePlacementsForCopyright(missingIds, options)
  return inputs.map(input => copyrightPlacementMutationResult(input, withhold, applied, current))
}

function copyrightPlacementMutationResult(
  input: CopyrightImagePlacementMutationInput,
  withhold: boolean,
  applied: ReadonlyMap<string, CopyrightImagePlacement>,
  current: ReadonlyMap<string, CopyrightImagePlacement>,
): CopyrightImagePlacementMutation {
  const placementId = input.placementId.toLowerCase()
  const updated = applied.get(placementId)
  if (updated) return { status: 'applied', placement: updated }
  const found = current.get(placementId)
  if (!found) return { status: 'not_found' }
  if (found.deleted) return { status: 'deleted', placement: found }
  const desiredApplied = withhold ? found.withheld : !found.withheld
  if (desiredApplied && found.revision === input.expectedRevision + 1) {
    return { status: 'already_applied', placement: found }
  }
  return { status: 'stale', placement: found }
}

export async function withholdImagePlacementsForCopyright(
  inputs: readonly CopyrightImagePlacementMutationInput[],
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation[]> {
  return changeImagePlacementsCopyrightWithholding(inputs, true, options)
}

export async function withholdImagePlacementForCopyright(
  input: CopyrightImagePlacementMutationInput,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  const [result] = await withholdImagePlacementsForCopyright([input], options)
  return result!
}

export async function restoreImagePlacementForCopyright(
  input: CopyrightImagePlacementMutationInput,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  const [result] = await changeImagePlacementsCopyrightWithholding([input], false, options)
  return result!
}
