import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from './types.mts'
import type { CommunityOwner } from './search.mts'
import { getCommunityMember } from './members/get.mts'
import { getPendingApplicationForUser } from './applications/pending.mts'
import { currentUserCanModerateCommunity, currentUserCanViewCommunity } from './authorization.mts'

export type CommunityWithOwner = Community & { owner: CommunityOwner | null }

export type LoadedCommunity = {
  community: CommunityWithOwner
  membership: CommunityMember | null
  hasPendingApplication: boolean
}

type CommunityRowWithOwner = Community & {
  owner_id: string | null
  owner_username: string | null
  lingua_rs_content_sha256?: unknown
  lingua_rs_input_sha256?: unknown
  lingua_rs_results?: unknown
  lingua_rs_detected_at?: unknown
}

function mapCommunityWithOwner(row: CommunityRowWithOwner): CommunityWithOwner {
  const {
    owner_id,
    owner_username,
    lingua_rs_content_sha256: _contentSha256,
    lingua_rs_input_sha256: _inputSha256,
    lingua_rs_results: _results,
    lingua_rs_detected_at: _detectedAt,
    ...community
  } = row
  return {
    ...community,
    owner: owner_id ? { id: owner_id, username: owner_username } : null,
  }
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
    SELECT c.*, u.id AS owner_id, u.username AS owner_username
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
        u.username AS owner_username
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
        u.username AS owner_username
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
