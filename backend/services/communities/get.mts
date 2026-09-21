import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { CommunityMember } from './types.mts'
import { getCommunityMember } from './members/get.mts'
import { getPendingApplicationForUser } from './applications/pending.mts'
import {
  currentUserCanModerateCommunity,
  currentUserCanModerateCommunityPublication,
  currentUserCanViewCommunity,
} from './authorization.mts'
import {
  mapCommunityWithOwner,
  type CommunityRowWithOwner,
  type CommunityWithOwner,
} from './get-mapping.mts'

export type { CommunityWithOwner } from './get-mapping.mts'

export type LoadedCommunity = {
  community: CommunityWithOwner
  membership: CommunityMember | null
  hasPendingApplication: boolean
}

export async function loadCommunityForViewer(
  currentUser: PrivateUser | null,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const community = await getCommunityOrThrow(idOrSlug, options)
  const membership = currentUser
    ? await getCommunityMember(community.id, currentUser.id, options)
    : null
  assert(
    currentUserCanViewCommunity(currentUser, community, membership),
    404,
    'Community not found',
  )
  return { community, membership, hasPendingApplication: false }
}

// Only for the community detail route — applicants can view the community page without being members
export async function loadCommunityForViewerOrApplicant(
  currentUser: PrivateUser | null,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const community = await getCommunityOrThrow(idOrSlug, options)
  const membership = currentUser
    ? await getCommunityMember(community.id, currentUser.id, options)
    : null
  const canView = currentUserCanViewCommunity(currentUser, community, membership)
  const hasPendingApplication =
    !canView && currentUser && community.visibility === 'private'
      ? !!(await getPendingApplicationForUser(community.id, currentUser.id, options))
      : false
  assert(canView || hasPendingApplication, 404, 'Community not found')
  return { community, membership, hasPendingApplication }
}

export async function loadCommunityForModerator(
  currentUser: PrivateUser,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const community = await getCommunityOrThrow(idOrSlug, options)
  const membership = await getCommunityMember(community.id, currentUser.id, options)
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')
  return { community, membership, hasPendingApplication: false }
}

export async function loadCommunityForPublicationModerator(
  currentUser: PrivateUser,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const community = await getCommunityOrThrow(idOrSlug, options)
  const membership = await getCommunityMember(community.id, currentUser.id, options)
  assert(
    currentUserCanModerateCommunityPublication(currentUser, community, membership),
    403,
    'Forbidden',
  )
  return { community, membership, hasPendingApplication: false }
}

export async function getCommunityOrThrow(
  idOrSlug: string,
  options?: QueryOptions,
): Promise<CommunityWithOwner> {
  const community = await getCommunity(idOrSlug, options)
  assert(community, 404, 'Community not found')
  return community
}

/** Always queries by slug column — use when the value is a slug, even if it looks like a UUID. */
export async function getCommunityBySlugOnly(slug: string): Promise<CommunityWithOwner | null> {
  const { rows } = await read(
    sql`/* getCommunityBySlugOnly */
    SELECT c.*, u.id AS owner_id, u.username AS owner_username,
      (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
       FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
       WHERE surface.surface_kind = 'community-profile-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
         AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
       ORDER BY placement.id DESC LIMIT 1) AS profile_image_placement,
      (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
       FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
       WHERE surface.surface_kind = 'community-banner-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
         AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
       ORDER BY placement.id DESC LIMIT 1) AS banner_image_placement
    FROM communities c
    LEFT JOIN users u ON u.id = c.created_by_id
    WHERE c.slug = ${slug.toLowerCase()}
      AND c.deleted_at IS NULL
    LIMIT 1`,
  )
  if (!rows[0]) return null
  return mapCommunityWithOwner(rows[0] as CommunityRowWithOwner)
}

export async function getCommunity(
  idOrSlug: string,
  options?: QueryOptions,
): Promise<CommunityWithOwner | null> {
  let result
  if (isUUID(idOrSlug)) {
    const { rows } = await read(
      sql`/* getCommunityById */
      SELECT c.*,
        u.id AS owner_id,
        u.username AS owner_username,
        (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
         FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
         WHERE surface.surface_kind = 'community-profile-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
           AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
         ORDER BY placement.id DESC LIMIT 1) AS profile_image_placement,
        (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
         FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
         WHERE surface.surface_kind = 'community-banner-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
           AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
         ORDER BY placement.id DESC LIMIT 1) AS banner_image_placement
      FROM communities c
      LEFT JOIN users u ON u.id = c.created_by_id
      WHERE c.id = ${idOrSlug}
        AND c.deleted_at IS NULL
      LIMIT 1`,
      options,
    )
    result = rows[0]
  } else {
    const { rows } = await read(
      sql`/* getCommunityBySlug */
      SELECT c.*,
        u.id AS owner_id,
        u.username AS owner_username,
        (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
         FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
         WHERE surface.surface_kind = 'community-profile-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
           AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
         ORDER BY placement.id DESC LIMIT 1) AS profile_image_placement,
        (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
         FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
         WHERE surface.surface_kind = 'community-banner-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
           AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
         ORDER BY placement.id DESC LIMIT 1) AS banner_image_placement
      FROM communities c
      LEFT JOIN users u ON u.id = c.created_by_id
      WHERE c.slug = ${idOrSlug.toLowerCase()}
        AND c.deleted_at IS NULL
      LIMIT 1`,
      options,
    )
    result = rows[0]
  }

  if (!result) return null

  return mapCommunityWithOwner(result as CommunityRowWithOwner)
}
