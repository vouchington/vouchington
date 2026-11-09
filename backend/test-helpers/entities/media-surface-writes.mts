import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeImageSurfaceMutation } from '../../services/media-delivery-safety/surface-mutation.mts'
import { writeTestImageSurfaceMutation } from '../image-surface-mutation.mts'

export async function setTestTopicSurfaceImages(
  topicId: string,
  input: { logoImageId?: string | null; heroImageId?: string | null },
): Promise<void> {
  await using query = await beginTransaction()
  const logoImageId = input.logoImageId === undefined ? null : input.logoImageId
  const heroImageId = input.heroImageId === undefined ? null : input.heroImageId
  const { rows: actors } = await query<{ created_by_id: string }>(
    sql`/* setTestTopicSurfaceImages:actor */ SELECT created_by_id FROM topics WHERE id = ${topicId}`,
  )
  const actorUserId = actors[0]?.created_by_id ?? null
  const references = [
    ...(input.logoImageId !== undefined
      ? [{ surfaceKind: 'topic-logo-image' as const, topicId, nextImageId: logoImageId }]
      : []),
    ...(input.heroImageId !== undefined
      ? [{ surfaceKind: 'topic-hero-image' as const, topicId, nextImageId: heroImageId }]
      : []),
  ]
  await writeImageSurfaceMutation(query, references, actorUserId, async (_before, scopeQuery) => {
    await scopeQuery(sql`/* setTestTopicSurfaceImages */
    UPDATE topics SET
      logo_image_id = CASE WHEN ${input.logoImageId !== undefined}
        THEN ${logoImageId}::uuid ELSE logo_image_id END,
      hero_image_id = CASE WHEN ${input.heroImageId !== undefined}
        THEN ${heroImageId}::uuid ELSE hero_image_id END
    WHERE id = ${topicId}
  `)
  })
  await query.commit()
}

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
  await writeImageSurfaceMutation(query, references, actorUserId, async (_before, scopeQuery) => {
    await scopeQuery(sql`/* setTestCommunitySurfaceImages */
    UPDATE communities
    SET profile_image_id = CASE WHEN ${input.profileImageId !== undefined}
          THEN ${profileImageId}::uuid ELSE profile_image_id END,
        banner_image_id = CASE WHEN ${input.bannerImageId !== undefined}
          THEN ${bannerImageId}::uuid ELSE banner_image_id END,
        deleted_at = CASE WHEN ${input.deleted === true} THEN CURRENT_TIMESTAMP ELSE deleted_at END
    WHERE id = ${communityId}
  `)
  })
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
