import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { selectCommunityWithOwner } from './select-community.mts'
import { loadCommunityWithViewer, type LoadedCommunity } from './load-with-viewer.mts'
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
export type { LoadedCommunity } from './load-with-viewer.mts'

export async function loadCommunityForViewer(
  currentUser: PrivateUser | null,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const loaded = await loadCommunityWithViewer(idOrSlug, currentUser?.id ?? null, options)
  assert(
    currentUserCanViewCommunity(currentUser, loaded.community, loaded.membership),
    404,
    'Community not found',
  )
  return loaded
}

// Only for the community detail route — applicants can view the community page without being members
export async function loadCommunityForViewerOrApplicant(
  currentUser: PrivateUser | null,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const { community, membership, hasPendingApplication } = await loadCommunityWithViewer(
    idOrSlug,
    currentUser?.id ?? null,
    options,
    { includePendingApplication: true },
  )
  const canView = currentUserCanViewCommunity(currentUser, community, membership)
  const isApplicant = !canView && community.visibility === 'private' && hasPendingApplication
  assert(canView || isApplicant, 404, 'Community not found')
  return { community, membership, hasPendingApplication: isApplicant }
}

export async function loadCommunityForModerator(
  currentUser: PrivateUser,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const loaded = await loadCommunityWithViewer(idOrSlug, currentUser.id, options)
  assert(
    currentUserCanModerateCommunity(currentUser, loaded.community, loaded.membership),
    403,
    'Forbidden',
  )
  return loaded
}

export async function loadCommunityForPublicationModerator(
  currentUser: PrivateUser,
  idOrSlug: string,
  options?: QueryOptions,
): Promise<LoadedCommunity> {
  const loaded = await loadCommunityWithViewer(idOrSlug, currentUser.id, options)
  assert(
    currentUserCanModerateCommunityPublication(currentUser, loaded.community, loaded.membership),
    403,
    'Forbidden',
  )
  return loaded
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
  const query = selectCommunityWithOwner(sql`/* getCommunityBySlugOnly */ SELECT `).append(
    sql` WHERE c.slug = ${slug.toLowerCase()} AND c.deleted_at IS NULL LIMIT 1`,
  )
  const prefix = '/* getCommunityBySlugOnly */ SELECT '
  if (!query.text.startsWith(prefix)) throw new Error('Community slug SQL prefix changed')
  const { rows } = await read(
    `/* getCommunityBySlugOnly */ SELECT ${query.text.slice(prefix.length)}`,
    query.values,
  )
  if (!rows[0]) return null
  return mapCommunityWithOwner(rows[0] as CommunityRowWithOwner)
}

export async function getCommunity(
  idOrSlug: string,
  options?: QueryOptions,
): Promise<CommunityWithOwner | null> {
  const byId = isUUID(idOrSlug)
  const query = byId
    ? selectCommunityWithOwner(sql`/* getCommunityById */ SELECT `).append(
        sql` WHERE c.id = ${idOrSlug}`,
      )
    : selectCommunityWithOwner(sql`/* getCommunityBySlug */ SELECT `).append(
        sql` WHERE c.slug = ${idOrSlug.toLowerCase()}`,
      )
  query.append(sql` AND c.deleted_at IS NULL LIMIT 1`)
  const prefix = byId ? '/* getCommunityById */ SELECT ' : '/* getCommunityBySlug */ SELECT '
  if (!query.text.startsWith(prefix)) throw new Error('Community SQL prefix changed')
  const { rows } = byId
    ? await read(
        `/* getCommunityById */ SELECT ${query.text.slice(prefix.length)}`,
        query.values,
        options,
      )
    : await read(
        `/* getCommunityBySlug */ SELECT ${query.text.slice(prefix.length)}`,
        query.values,
        options,
      )
  if (!rows[0]) return null
  return mapCommunityWithOwner(rows[0] as CommunityRowWithOwner)
}
