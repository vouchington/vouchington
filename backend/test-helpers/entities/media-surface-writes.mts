import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeImageSurfaceMutation } from '../../services/media-delivery-safety/surface-mutation.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '../../services/media-delivery-safety/surface-mutation-bindings.mts'
import { writeTestImageSurfaceMutation } from '../image-surface-mutation.mts'

export { setTestTopicSurfaceImages } from './topic-surface-writes.mts'

export async function setTestCommunitySurfaceImages(
  communityId: string,
  input: { profileImageId?: string | null; bannerImageId?: string | null; deleted?: boolean },
): Promise<void> {
  if (
    input.deleted &&
    [input.profileImageId, input.bannerImageId].some(id => id !== null && id !== undefined)
  )
    throw new Error('Deleted community fixture cannot add a public image')
  await using query = await beginTransaction()
  const profileImageId = input.profileImageId === undefined ? null : input.profileImageId
  const bannerImageId = input.bannerImageId === undefined ? null : input.bannerImageId
  const { rows: actors } = await query<{ created_by_id: string }>(
    sql`/* setTestCommunitySurfaceImages:actor */ SELECT created_by_id FROM communities WHERE id = ${communityId}`,
  )
  const actorUserId = actors[0]?.created_by_id ?? null
  const references = [
    ...(input.profileImageId !== undefined || input.deleted
      ? [
          {
            surfaceKind: 'community-profile-image' as const,
            communityId,
            nextImageId: input.deleted ? null : profileImageId,
          },
        ]
      : []),
    ...(input.bannerImageId !== undefined || input.deleted
      ? [
          {
            surfaceKind: 'community-banner-image' as const,
            communityId,
            nextImageId: input.deleted ? null : bannerImageId,
          },
        ]
      : []),
  ]
  await writeImageSurfaceMutation(
    query,
    references,
    actorUserId,
    async (mutationReferences, scopeQuery) => {
      if (mutationReferences.length === 0) return { result: undefined, changes: [] }
      const statement = imageSurfaceMutationPreimage(
        mutationReferences,
        'setTestCommunitySurfaceImages',
      )
      statement.append(sql`, updated AS (
      UPDATE communities SET
        profile_image_id = CASE WHEN ${input.profileImageId !== undefined} THEN ${profileImageId}::uuid ELSE profile_image_id END,
        banner_image_id = CASE WHEN ${input.bannerImageId !== undefined} THEN ${bannerImageId}::uuid ELSE banner_image_id END,
        deleted_at = CASE WHEN ${input.deleted === true} THEN CURRENT_TIMESTAMP ELSE deleted_at END
      FROM (SELECT DISTINCT community_id FROM surface_preimage) owner_preimage
      WHERE communities.id = ${communityId} AND owner_preimage.community_id = communities.id`)
      if (input.profileImageId !== undefined || input.deleted)
        statement.append(sql` AND communities.profile_image_id IS NOT DISTINCT FROM
          (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-profile-image')`)
      if (input.bannerImageId !== undefined || input.deleted)
        statement.append(sql` AND communities.banner_image_id IS NOT DISTINCT FROM
          (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-banner-image')`)
      statement.append(sql` RETURNING WITH (OLD AS prior, NEW AS current)
        prior.profile_image_id AS previous_profile_image_id, current.profile_image_id AS current_profile_image_id,
        prior.banner_image_id AS previous_banner_image_id, current.banner_image_id AS current_banner_image_id,
        (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_id,
        (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_revision,
        (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_activation_revision,
        (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_id,
        (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_revision,
        (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_activation_revision
    ) SELECT * FROM updated`)
      const { rows } = await scopeQuery<{
        previous_profile_image_id: string | null
        current_profile_image_id: string | null
        previous_banner_image_id: string | null
        current_banner_image_id: string | null
        previous_profile_placement_id: string | null
        previous_profile_placement_revision: number | null
        previous_profile_activation_revision: number | null
        previous_banner_placement_id: string | null
        previous_banner_placement_revision: number | null
        previous_banner_activation_revision: number | null
      }>(statement)
      if (rows.length !== 1) throw new Error('Test community image surface changed')
      const row = rows[0]!
      return {
        result: undefined,
        changes: mutationReferences.map((reference, index) =>
          imageSurfaceMutationChange(
            reference.surfaceKind === 'community-profile-image'
              ? {
                  ordinality: index + 1,
                  previousImageId: row.previous_profile_image_id,
                  currentImageId: input.deleted ? null : row.current_profile_image_id,
                  previousPlacementId: row.previous_profile_placement_id,
                  previousPlacementRevision: row.previous_profile_placement_revision,
                  previousActivationRevision: row.previous_profile_activation_revision,
                }
              : {
                  ordinality: index + 1,
                  previousImageId: row.previous_banner_image_id,
                  currentImageId: input.deleted ? null : row.current_banner_image_id,
                  previousPlacementId: row.previous_banner_placement_id,
                  previousPlacementRevision: row.previous_banner_placement_revision,
                  previousActivationRevision: row.previous_banner_activation_revision,
                },
          ),
        ),
      }
    },
  )
  await query.commit()
}

export async function setTestUserProfileImage(
  userId: string,
  imageId: string | null,
): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageSurfaceMutation(
    { surfaceKind: 'user-profile-image', userId },
    imageId,
    imageId ? userId : null,
    query,
  )
  await query.commit()
}
