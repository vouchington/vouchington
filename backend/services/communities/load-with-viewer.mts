import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommunityMember } from './types.mts'
import {
  mapCommunityWithOwner,
  type CommunityRowWithOwner,
  type CommunityWithOwner,
} from './get-mapping.mts'
import { selectCommunityWithOwner } from './select-community.mts'

export type LoadedCommunity = {
  community: CommunityWithOwner
  membership: CommunityMember | null
  hasPendingApplication: boolean
}

type ViewerRow = CommunityRowWithOwner & {
  membership_id: string | null
  membership_community_id: string
  membership_user_id: string
  membership_role: CommunityMember['role']
  membership_approved_by_id: string | null
  membership_created_at: Date
  membership_updated_at: Date
  membership_removed_at: Date | null
  membership_removed_by_id: string | null
  has_pending_application: boolean | null
}

function viewerColumns(viewerId: string | null, includePendingApplication: boolean) {
  // Same predicate as getPendingApplicationForUser in applications/pending.mts.
  const pending: SQLStatement =
    includePendingApplication && viewerId
      ? sql`, EXISTS (
        SELECT 1 FROM community_applications ca
        WHERE ca.community_id = c.id AND ca.user_id = ${viewerId}
          AND ca.approved_at IS NULL AND ca.rejected_at IS NULL
      ) AS has_pending_application`
      : sql`, NULL::boolean AS has_pending_application`
  return sql`,
    cm.id AS membership_id, cm.community_id AS membership_community_id,
    cm.user_id AS membership_user_id, cm.role AS membership_role,
    cm.approved_by_id AS membership_approved_by_id, cm.created_at AS membership_created_at,
    cm.updated_at AS membership_updated_at, cm.removed_at AS membership_removed_at,
    cm.removed_by_id AS membership_removed_by_id`.append(pending)
}

/**
 * Loads a community (UUID id, otherwise lower-cased slug) together with the viewer's active
 * membership in one statement. A null viewer binds NULL, so the membership join matches nothing.
 */
async function queryCommunityWithViewer(
  idOrSlug: string,
  viewerId: string | null,
  options: QueryOptions | undefined,
  includePendingApplication: boolean,
): Promise<LoadedCommunity | null> {
  const extra = {
    columns: viewerColumns(viewerId, includePendingApplication),
    join: sql` LEFT JOIN community_members cm
    ON cm.community_id = c.id AND cm.user_id = ${viewerId}::uuid AND cm.removed_at IS NULL`,
  }
  const query = isUUID(idOrSlug)
    ? selectCommunityWithOwner(sql`/* getCommunityWithViewerById */ SELECT `, extra).append(
        sql` WHERE c.id = ${idOrSlug} AND c.deleted_at IS NULL LIMIT 1`,
      )
    : selectCommunityWithOwner(sql`/* getCommunityWithViewerBySlug */ SELECT `, extra).append(
        sql` WHERE c.slug = ${idOrSlug.toLowerCase()} AND c.deleted_at IS NULL LIMIT 1`,
      )
  const { rows } = await read(query, options)
  const row = rows[0] as ViewerRow | undefined
  if (!row) return null
  const {
    membership_id,
    membership_community_id,
    membership_user_id,
    membership_role,
    membership_approved_by_id,
    membership_created_at,
    membership_updated_at,
    membership_removed_at,
    membership_removed_by_id,
    has_pending_application,
    ...communityRow
  } = row
  return {
    community: mapCommunityWithOwner(communityRow),
    membership: membership_id
      ? ({
          id: membership_id,
          community_id: membership_community_id,
          user_id: membership_user_id,
          role: membership_role,
          approved_by_id: membership_approved_by_id,
          created_at: membership_created_at,
          updated_at: membership_updated_at,
          removed_at: membership_removed_at,
          removed_by_id: membership_removed_by_id,
        } as CommunityMember)
      : null,
    hasPendingApplication: has_pending_application === true,
  }
}

/** One read for the community and the viewer's membership; null when no live community matches. */
export async function getCommunityWithViewer(
  idOrSlug: string,
  viewerId: string | null,
  options?: QueryOptions,
): Promise<LoadedCommunity | null> {
  return queryCommunityWithViewer(idOrSlug, viewerId, options, false)
}

/** Like `getCommunityWithViewer`, throwing 404 "Community not found" when there is no community. */
export async function loadCommunityWithViewer(
  idOrSlug: string,
  viewerId: string | null,
  options?: QueryOptions,
  flags?: { includePendingApplication?: boolean },
): Promise<LoadedCommunity> {
  const loaded = await queryCommunityWithViewer(
    idOrSlug,
    viewerId,
    options,
    flags?.includePendingApplication ?? false,
  )
  assert(loaded, 404, 'Community not found')
  return loaded
}
