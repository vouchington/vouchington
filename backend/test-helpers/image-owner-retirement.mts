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
import { retireTestPairedImageOwners } from './image-paired-owner-retirement.mts'

export { writeTestImageOwnerRetirement } from './image-owner-retirement-write.mts'

export async function retireTestUserImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestUserImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  const statement = imageSurfaceMutationPreimage(references, annotation)
  statement.append(sql`, retired AS (UPDATE users SET `).append(setClause)
  statement.append(sql` FROM surface_preimage before
    WHERE users.id = before.user_id
      AND users.profile_image_id IS NOT DISTINCT FROM before.current_image_id
    RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
      prior.profile_image_id AS previous_image_id,
      CASE WHEN current.deleted_at IS NULL THEN current.profile_image_id END AS current_image_id,
      before.placement_id AS previous_placement_id,
      before.placement_revision AS previous_placement_revision,
      before.activation_revision AS previous_activation_revision
  ) SELECT * FROM retired`)
  const { rows } = await query<{
    ordinality: number
    previous_image_id: string | null
    current_image_id: string | null
    previous_placement_id: string | null
    previous_placement_revision: number | null
    previous_activation_revision: number | null
  }>(statement)
  if (rows.length !== references.length) throw new Error('Test user image owner changed')
  return {
    result: undefined,
    changes: rows.map(row =>
      imageSurfaceMutationChange({
        ordinality: row.ordinality,
        previousImageId: row.previous_image_id,
        currentImageId: row.current_image_id,
        previousPlacementId: row.previous_placement_id,
        previousPlacementRevision: row.previous_placement_revision,
        previousActivationRevision: row.previous_activation_revision,
      }),
    ),
  }
}

export { retireTestTopicImageOwners } from './image-topic-owner-retirement.mts'

export async function retireTestCommunityImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestCommunityImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  return retireTestPairedImageOwners(references, query, setClause, {
    annotation,
    table: 'communities',
    ownerIdColumn: 'community_id',
    surfaces: [
      { surfaceKind: 'community-profile-image', imageColumn: 'profile_image_id' },
      { surfaceKind: 'community-banner-image', imageColumn: 'banner_image_id' },
    ],
    requireUnmerged: false,
    ownerIdOf: reference => ('communityId' in reference ? reference.communityId : ''),
    changedError: 'Test community image owner changed',
  })
}
