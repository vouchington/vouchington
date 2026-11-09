import { readSurfaceBindings } from '../services/media-delivery-safety/surface-mutation-bindings.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { ImageSurfaceReference } from '../services/media-delivery-safety/surface-lock.mts'
import { writeImageSurfaceMutation } from '../services/media-delivery-safety/surface-mutation.mts'
import sql from 'sql-template-strings'

/** Fixture writes the actual owner through the production owner/capacity/edge transaction. */
export async function writeTestImageSurfaceMutation(
  reference: ImageSurfaceReference,
  imageId: string | null,
  actorUserId: string | null,
  query: TransactionQuery,
) {
  await writeImageSurfaceMutation(
    query,
    [{ ...reference, nextImageId: imageId }],
    actorUserId,
    async (before, scopeQuery) => {
      const expected = before[0]!.current_image_id
      if (expected === imageId?.toLowerCase() || (expected === null && imageId === null)) return
      let result
      if ('userId' in reference)
        result = await scopeQuery(sql`/* writeTestUserImageSurface */
        UPDATE users SET profile_image_id = ${imageId}
        WHERE id = ${reference.userId} AND profile_image_id IS NOT DISTINCT FROM ${expected}::uuid`)
      else if ('topicId' in reference)
        result =
          reference.surfaceKind === 'topic-logo-image'
            ? await scopeQuery(sql`/* writeTestTopicLogoSurface */ UPDATE topics SET logo_image_id = ${imageId}
          WHERE id = ${reference.topicId} AND logo_image_id IS NOT DISTINCT FROM ${expected}::uuid`)
            : await scopeQuery(sql`/* writeTestTopicHeroSurface */ UPDATE topics SET hero_image_id = ${imageId}
          WHERE id = ${reference.topicId} AND hero_image_id IS NOT DISTINCT FROM ${expected}::uuid`)
      else if ('communityId' in reference)
        result =
          reference.surfaceKind === 'community-profile-image'
            ? await scopeQuery(sql`/* writeTestCommunityProfileSurface */ UPDATE communities SET profile_image_id = ${imageId}
          WHERE id = ${reference.communityId} AND profile_image_id IS NOT DISTINCT FROM ${expected}::uuid`)
            : await scopeQuery(sql`/* writeTestCommunityBannerSurface */ UPDATE communities SET banner_image_id = ${imageId}
          WHERE id = ${reference.communityId} AND banner_image_id IS NOT DISTINCT FROM ${expected}::uuid`)
      else
        result =
          await scopeQuery(sql`/* writeTestProfileLinkSurface */ UPDATE user_profile_links SET image_id = ${imageId}
        WHERE id = ${reference.userProfileLinkId} AND image_id IS NOT DISTINCT FROM ${expected}::uuid`)
      if (result.rowCount !== 1) throw new Error('Image surface fixture owner changed')
    },
  )
  return readCurrentImageSurfaceTuple(query, reference)
}

async function readCurrentImageSurfaceTuple(
  query: TransactionQuery,
  reference: ImageSurfaceReference,
) {
  const [row] = await readSurfaceBindings(query, [{ ...reference, nextImageId: null }])
  return row?.placement_id && row.image_id && row.placement_revision !== null
    ? {
        placement_id: row.placement_id,
        placement_revision: row.placement_revision,
        image_id: row.image_id,
      }
    : null
}
