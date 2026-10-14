import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'
import { markImageDeliveryAuthorityStarted } from './asset-admission-lock.mts'

export type ImageSurfaceReference =
  | { surfaceKind: 'user-profile-image'; userId: string }
  | { surfaceKind: 'topic-logo-image' | 'topic-hero-image'; topicId: string }
  | { surfaceKind: 'community-profile-image' | 'community-banner-image'; communityId: string }
  | { surfaceKind: 'user-profile-link-image'; userProfileLinkId: string }

/** Stable owner identity precedes discovering the currently bound placement. */
export async function lockUserProfileImageOwners(
  userIds: string[],
  query: QueryExecutor,
): Promise<void> {
  await lockSurfaceOwnerDomains({ userIds }, query)
}
export async function lockUserProfileLinkImageOwners(
  linkIds: string[],
  query: QueryExecutor,
): Promise<void> {
  await lockSurfaceOwnerDomains({ linkIds }, query)
}

type SurfaceOwnerDomains = {
  userIds?: string[]
  linkIds?: string[]
  topicIds?: string[]
  communityIds?: string[]
}

async function lockSurfaceOwnerDomains(
  owners: SurfaceOwnerDomains,
  query: QueryExecutor,
): Promise<void> {
  assertImageDeliveryTransaction(query)
  await markImageDeliveryAuthorityStarted(query)
  await query(sql`/* lockSurfaceOwnerDomains */
    SELECT pg_advisory_xact_lock(hashtextextended(key, 0))
    FROM (SELECT DISTINCT key FROM (
      SELECT 'image-user-profile:' || id::text AS key FROM unnest(${owners.userIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-profile-link:' || id::text FROM unnest(${owners.linkIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-topic:' || id::text FROM unnest(${owners.topicIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-community:' || id::text FROM unnest(${owners.communityIds ?? []}::uuid[]) id
    ) domains ORDER BY key) ordered
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

/** Preserve input order (and duplicate references) while querying all surface kinds together. */
export function imageSurfaceReferences(
  references: (ImageSurfaceReference & { nextImageId?: string | null })[],
): ReturnType<typeof sql> {
  return sql`SELECT surface_kind, user_id, topic_id, community_id, user_profile_link_id,
      next_image_id, ordinality
    FROM unnest(
      ${references.map(ref => ref.surfaceKind)}::image_surface_placement_surface_kinds[],
      ${references.map(ref => ('userId' in ref ? ref.userId : null))}::uuid[],
      ${references.map(ref => ('topicId' in ref ? ref.topicId : null))}::uuid[],
      ${references.map(ref => ('communityId' in ref ? ref.communityId : null))}::uuid[],
      ${references.map(ref => ('userProfileLinkId' in ref ? ref.userProfileLinkId : null))}::uuid[],
      ${references.map(ref => ref.nextImageId ?? null)}::uuid[]
    ) WITH ORDINALITY AS refs(
      surface_kind, user_id, topic_id, community_id, user_profile_link_id,
      next_image_id, ordinality
    )`
}

/** Includes historical reusable bindings: later owner writes cannot expand a held domain. */
export async function lockImageSurfacePlacements(
  references: ImageSurfaceReference[],
  query: QueryExecutor,
): Promise<void> {
  await lockSurfaceOwnerDomains(
    {
      userIds: references.flatMap(ref => ('userId' in ref ? [ref.userId] : [])),
      linkIds: references.flatMap(ref =>
        'userProfileLinkId' in ref ? [ref.userProfileLinkId] : [],
      ),
      topicIds: references.flatMap(ref => ('topicId' in ref ? [ref.topicId] : [])),
      communityIds: references.flatMap(ref => ('communityId' in ref ? [ref.communityId] : [])),
    },
    query,
  )
  const statement = sql`/* lockImageSurfacePlacements */
    WITH refs AS (`
  statement.append(imageSurfaceReferences(references))
  statement.append(sql`)
    SELECT surface.placement_id
    FROM refs
    JOIN image_surface_placements surface ON surface.surface_kind = refs.surface_kind
      AND (surface.user_id = refs.user_id OR surface.topic_id = refs.topic_id
        OR surface.community_id = refs.community_id
        OR surface.user_profile_link_id = refs.user_profile_link_id)
    ORDER BY refs.ordinality`)
  const placementIds = references.length
    ? (await query<{ placement_id: string }>(statement)).rows.map(row => row.placement_id)
    : []
  await lockImageDeliveryMutation(query, { placementIds, placementOnly: true })
}
