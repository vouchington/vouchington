import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'
import { imageDeliveryAuthorityStartedSql } from './asset-admission-lock.mts'

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
  const statement = sql`/* lockSurfaceOwnerDomains */
    SELECT count(pg_advisory_xact_lock(hashtextextended(key, 0))) AS locked, `
  statement.append(imageDeliveryAuthorityStartedSql())
  statement.append(sql` AS authority_started
    FROM (SELECT DISTINCT key FROM (
      SELECT 'image-user-profile:' || id::text AS key FROM unnest(${owners.userIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-profile-link:' || id::text FROM unnest(${owners.linkIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-topic:' || id::text FROM unnest(${owners.topicIds ?? []}::uuid[]) id
      UNION ALL SELECT 'image-community:' || id::text FROM unnest(${owners.communityIds ?? []}::uuid[]) id
    ) domains ORDER BY key) ordered
  `)
  await query(statement)
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
