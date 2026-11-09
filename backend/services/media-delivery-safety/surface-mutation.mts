import { withTransactionSavepoint } from '@data-stores/psql/transaction-savepoint'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { reserveImagePlacementChanges } from './placement-capacity-reservations.mts'
import { prepublishImagePlacementDenialBatch } from './delivery-registry-publish.mts'
import { stageImagePlacementDeliveryRecords } from './delivery-registry-staging.mts'
import { assertImagesReadyForSurface } from './asset-admission-lock.mts'

import {
  readSurfaceBindings,
  type ImageSurfaceMutation,
  type ImageSurfaceMutationBinding,
} from './surface-mutation-bindings.mts'
export type {
  ImageSurfaceMutation,
  ImageSurfaceMutationBinding,
} from './surface-mutation-bindings.mts'

/** The callback writes the actual owner first; all DB changes roll back before a capacity refusal. */
export async function writeImageSurfaceMutation<Result>(
  parentQuery: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
  actorUserId: string | null,
  writeOwner: (
    before: readonly ImageSurfaceMutationBinding[],
    query: TransactionQuery,
  ) => Promise<Result>,
): Promise<Result> {
  if (references.length === 0) return writeOwner([], parentQuery)
  assert(
    actorUserId || references.every(reference => reference.nextImageId === null),
    422,
    'An image surface activation requires an actor',
  )
  try {
    return await withTransactionSavepoint(parentQuery, async query => {
      // ast-grep-ignore: no-three-sequential-awaits -- the preimage determines the owner's expected write; the postimage must be read only after that write before enforcing and staging its transitions
      const before = await readSurfaceBindings(query, references)
      const result = await writeOwner(before, query)
      const after = await readSurfaceBindings(query, references)
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
      const currentIds = new Set(after.flatMap(row => (row.placement_id ? [row.placement_id] : [])))
      await reserveImagePlacementChanges(
        query,
        before.flatMap(row =>
          row.placement_id && !currentIds.has(row.placement_id) ? [row.placement_id] : [],
        ),
        after.flatMap(row =>
          row.placement_id && row.image_id && row.activation_revision !== null
            ? [
                {
                  placementId: row.placement_id,
                  imageId: row.image_id,
                  bindingFamily: 'surface' as const,
                  activationRevision: row.activation_revision,
                },
              ]
            : [],
        ),
      )
      const activated = after.filter(
        row =>
          row.placement_id &&
          !before.some(
            prior =>
              prior.placement_id === row.placement_id &&
              prior.activation_revision === row.activation_revision,
          ),
      )
      await assertImagesReadyForSurface(
        activated.flatMap(row => (row.image_id ? [row.image_id] : [])),
        query,
      )
      const removed = before.filter(
        row => row.placement_id && row.image_id && !currentIds.has(row.placement_id),
      )
      const { rows: retired } = removed.length
        ? await query<{ id: string; prior_revision: number }>(sql`
    /* readRetiredImageSurfaceDenials */ SELECT id, revision - 1 AS prior_revision
    FROM media_placements WHERE id = ANY(${removed.map(row => row.placement_id)}::uuid[])
      AND retirement_reason = 'owner_removed' AND retired_at IS NOT NULL`)
        : { rows: [] }
      const retiredById = new Map(retired.map(row => [row.id, row.prior_revision]))
      const denied = removed.flatMap(row => {
        const revision = retiredById.get(row.placement_id!)
        return revision === undefined
          ? []
          : [{ placementId: row.placement_id!, revision, imageId: row.image_id! }]
      })
      await prepublishImagePlacementDenialBatch(denied, { query })
      if (activated.length > 0) await recordSurfaceActivations(query, activated, actorUserId!)
      await stageImagePlacementDeliveryRecords(
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
      return result
    })
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '40P01')
      throw createCodedError(
        409,
        'Concurrent image placement change',
        IMAGE_PLACEMENT_LIMIT_REACHED,
      )
    throw err
  }
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
