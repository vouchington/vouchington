import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  admitImagePlacements,
  projectImagePlacementPolicy,
  withImagePlacementMutation,
} from './placement-capacity-reservations.mts'
import { settleImagePlacementDeliveryChanges } from './delivery-registry-publish.mts'
import { assertImagesReadyForSurface } from './asset-admission-lock.mts'

import {
  imageSurfaceMutationPreimage,
  readSurfaceBindings,
  type ImageSurfaceMutation,
  type ImageSurfaceMutationBinding,
  type ImageSurfaceMutationWrite,
} from './surface-mutation-bindings.mts'
export type {
  ImageSurfaceMutation,
  ImageSurfaceMutationWrite,
} from './surface-mutation-bindings.mts'

/** Count new admissions, then write the owner. A refusal happens before that write. */
export async function writeImageSurfaceMutation<Result>(
  parentQuery: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
  actorUserId: string | null,
  writeOwner: (
    references: readonly ImageSurfaceMutation[],
    query: TransactionQuery,
  ) => Promise<ImageSurfaceMutationWrite<Result>>,
): Promise<Result> {
  if (references.length === 0) return (await writeOwner([], parentQuery)).result
  assert(
    actorUserId || references.every(reference => reference.nextImageId === null),
    422,
    'An image surface activation requires an actor',
  )
  return withImagePlacementMutation(
    parentQuery,
    async query => {
      await admitSurfaceReferences(query, references)
      const write = await writeOwner(references, query)
      assert(
        write.changes.length === references.length,
        409,
        'Image surface owner changed during the mutation',
      )
      const after = await readSurfaceBindings(query, references, write.changes)
      for (const row of after) {
        const reference = references[Number(row.ordinality) - 1]!
        assert(
          row.current_image_id === reference.nextImageId?.toLowerCase() ||
            (row.current_image_id === null && reference.nextImageId === null),
          409,
          'Image surface owner changed during the mutation',
        )
        assert(
          !reference.nextImageId || row.placement_id,
          409,
          'Image surface placement was not created',
        )
      }
      await projectImagePlacementPolicy(
        query,
        after.flatMap(row => (row.placement_id ? [row.placement_id] : [])),
      )
      const activated = after.filter(
        row =>
          row.placement_id &&
          (row.previous_placement_id !== row.placement_id ||
            row.previous_activation_revision !== row.activation_revision),
      )
      await assertImagesReadyForSurface(
        activated.flatMap(row => (row.image_id ? [row.image_id] : [])),
        query,
      )
      if (activated.length > 0) await recordSurfaceActivations(query, activated, actorUserId!)
      const currentIds = new Set(after.flatMap(row => (row.placement_id ? [row.placement_id] : [])))
      const denied = after.flatMap(row =>
        row.previous_placement_id &&
        row.previous_image_id &&
        !currentIds.has(row.previous_placement_id) &&
        row.prior_denial_revision !== null
          ? [
              {
                placementId: row.previous_placement_id,
                revision: row.prior_denial_revision,
                imageId: row.previous_image_id,
              },
            ]
          : [],
      )
      return { write, after, activated, denied }
    },
    async ({ write, after, activated, denied }, query) => {
      await settleImagePlacementDeliveryChanges(
        denied,
        activated.flatMap(row =>
          row.placement_id && row.image_id && row.placement_revision !== null
            ? [
                {
                  placementId: row.placement_id,
                  revision: row.placement_revision,
                  imageId: row.image_id,
                  state: 'allow' as const,
                },
              ]
            : [],
        ),
        { query },
      )
      return write.resultFromBindings?.(after) ?? write.result
    },
  )
}

/** A live placement of the same image is not a new admission. */
async function admitSurfaceReferences(
  query: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
): Promise<void> {
  const activating = references.filter(reference => reference.nextImageId)
  if (activating.length === 0) return
  const statement = imageSurfaceMutationPreimage(references, 'readImageSurfaceAdmission')
  statement.append(` SELECT ordinality, placement_id, current_image_id FROM surface_preimage`)
  const { rows } = await query<{
    ordinality: string
    placement_id: string | null
    current_image_id: string | null
  }>(statement)
  const current = new Map(rows.map(row => [Number(row.ordinality), row]))
  await admitImagePlacements(
    query,
    references.flatMap((reference, index) => {
      if (!reference.nextImageId) return []
      const row = current.get(index + 1)
      const sameImage = row?.current_image_id === reference.nextImageId.toLowerCase()
      return [
        {
          imageId: reference.nextImageId,
          ...(sameImage && row?.placement_id ? { placementId: row.placement_id } : {}),
          alreadyActive: sameImage && row?.placement_id != null,
        },
      ]
    }),
  )
}

/** Owner image FKs select an exact unique family binding; old history is never walked. */
async function recordSurfaceActivations(
  query: TransactionQuery,
  rows: readonly ImageSurfaceMutationBinding[],
  actorUserId: string,
): Promise<void> {
  await query(sql`/* recordImageSurfaceMutationActivations */
    INSERT INTO image_surface_placement_activations (
      placement_id, surface_kind, placement_revision, bound_by_id, uploaded_by_id, is_bound_by_administrator
    ) SELECT surface.placement_id, surface.surface_kind, placement.revision, ${actorUserId}, image.created_by_id,
      CASE WHEN surface.surface_kind IN ('community-profile-image', 'community-banner-image')
        THEN EXISTS (SELECT 1 FROM user_roles role JOIN user_role_types type ON type.id = role.role_type_id
          WHERE role.user_id = ${actorUserId} AND type.slug = 'administrator') ELSE NULL END
    FROM unnest(${rows.map(row => row.placement_id)}::uuid[]) input(placement_id)
    JOIN image_surface_placements surface ON surface.placement_id = input.placement_id
    JOIN media_placements placement ON placement.id = surface.placement_id
    JOIN images image ON image.id = surface.image_id
    ORDER BY surface.placement_id ASC NULLS LAST, placement.revision ASC NULLS LAST
    ON CONFLICT (placement_id, placement_revision) DO NOTHING`)
}
