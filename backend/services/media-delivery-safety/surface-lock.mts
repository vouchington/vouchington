import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertImageDeliveryTransaction, lockImageDeliveryMutation } from './delivery-lock.mts'

export type ImageSurfaceReference =
  | { surfaceKind: 'user-profile-image'; userId: string }
  | { surfaceKind: 'topic-logo-image' | 'topic-hero-image'; topicId: string }
  | { surfaceKind: 'community-profile-image' | 'community-banner-image'; communityId: string }
  | { surfaceKind: 'user-profile-link-image'; userProfileLinkId: string }

/** Stable owner identity precedes discovering the currently bound placement. */
export async function lockImageSurfaceOwner(
  reference: ImageSurfaceReference,
  query: QueryExecutor,
): Promise<void> {
  assertImageDeliveryTransaction(query)
  const ownerId =
    'userId' in reference
      ? reference.userId
      : 'topicId' in reference
        ? reference.topicId
        : 'communityId' in reference
          ? reference.communityId
          : reference.userProfileLinkId
  await query(sql`/* lockImageSurfaceOwner */
    SELECT pg_advisory_xact_lock(hashtextextended(${`image-surface:${reference.surfaceKind}:${ownerId}`}, 0))
  `)
}

export function imageSurfaceWhere(reference: ImageSurfaceReference): ReturnType<typeof sql> {
  if ('userId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_id = ${reference.userId}`
  if ('topicId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.topic_id = ${reference.topicId}`
  if ('communityId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.community_id = ${reference.communityId}`
  return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_profile_link_id = ${reference.userProfileLinkId}`
}

/** Includes historical reusable bindings: later owner writes cannot expand a held domain. */
export async function lockImageSurfacePlacements(
  references: ImageSurfaceReference[],
  query: QueryExecutor,
): Promise<void> {
  const ordered = references.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const placementIds: string[] = []
  for (const reference of ordered) {
    // oxlint-disable-next-line no-await-in-loop -- stable owner identities precede every placement lock.
    await lockImageSurfaceOwner(reference, query)
  }
  for (const reference of ordered) {
    const statement = sql`SELECT surface.placement_id FROM image_surface_placements surface WHERE `
    statement.append(imageSurfaceWhere(reference))
    // oxlint-disable-next-line no-await-in-loop -- discover the entire domain before retaining any placement.
    const { rows } = await query<{ placement_id: string }>(statement)
    placementIds.push(...rows.map(row => row.placement_id))
  }
  await lockImageDeliveryMutation(query, { placementIds, placementOnly: true })
}
