import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { CommunityMember } from '../types.mts'
import { appendUserMembershipPrivacyFilter } from './get.mts'

type MemberCommunityPagination = { limit?: number; after?: string }
type MemberCommunityPage = { results: CommunityMember[]; page_info: PageInfo }

export async function listUserMemberCommunities(
  targetUserId: string,
  currentUser: PrivateUser | null,
  paginationOptions: MemberCommunityPagination = {},
  options: QueryOptions = {},
): Promise<MemberCommunityPage> {
  const { limit = 100, after } = paginationOptions
  const scope = `user:${targetUserId}:communities:member`
  const cursorId = after
    ? decodeScopedUuidCursor(after, scope, 'Invalid member-community cursor').id
    : undefined
  const query = sql`/* listUserMemberCommunities */
    SELECT cm.*
    FROM community_members cm
    INNER JOIN users member_user ON member_user.id = cm.user_id AND member_user.deleted_at IS NULL
    INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
    -- The closed UUID range is equivalent to equality and steers generic plans to (user_id, id).
    WHERE cm.user_id >= ${targetUserId}
      AND cm.user_id <= ${targetUserId}
      AND cm.removed_at IS NULL
      AND `
  appendMemberCommunityVisibilityFilters(query, targetUserId, currentUser)
  if (cursorId) query.append(sql` AND cm.id > ${cursorId}`)
  // user_id is redundant for result order, but matches the composite index prefix.
  query.append(sql` ORDER BY cm.user_id ASC, cm.id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query, options)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as CommunityMember[]
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: member => ({ id: member.id, scope }),
    }),
  }
}

export async function countUserMemberCommunities(
  targetUserId: string,
  currentUser: PrivateUser | null,
  options?: QueryOptions,
): Promise<number> {
  const query = sql`/* countUserMemberCommunities */
    SELECT COUNT(*) AS count
    FROM community_members cm
    INNER JOIN users member_user ON member_user.id = cm.user_id AND member_user.deleted_at IS NULL
    INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
    WHERE cm.user_id = ${targetUserId}
      AND cm.removed_at IS NULL
      AND `
  appendMemberCommunityVisibilityFilters(query, targetUserId, currentUser)
  const { rows } = await read(query, options)
  return Number((rows[0] as { count: string }).count)
}

function appendMemberCommunityVisibilityFilters(
  query: SQLStatement,
  targetUserId: string,
  currentUser: PrivateUser | null,
): void {
  if (currentUser?.id === targetUserId) {
    query.append(sql`TRUE`)
    return
  }

  appendUserMembershipPrivacyFilter(query, currentUser)
  appendVisibleCommunityMembershipFilter(query, currentUser)
}

function appendVisibleCommunityMembershipFilter(
  query: SQLStatement,
  currentUser: PrivateUser | null,
): void {
  if (currentUser?.roles.includes('administrator')) return

  if (!currentUser) {
    query.append(sql` AND c.visibility = 'public'
      AND (cm.role IN ('owner', 'moderator') OR c.member_roster_visibility = 'public')`)
    return
  }

  query.append(sql` AND (c.visibility = 'public' OR EXISTS (
      SELECT 1 FROM community_members viewer_cm
      WHERE viewer_cm.community_id = c.id
        AND viewer_cm.user_id = ${currentUser.id}
        AND viewer_cm.removed_at IS NULL
    ))
    AND (cm.role IN ('owner', 'moderator')
      OR c.member_roster_visibility IN ('public', 'users')
      OR (c.member_roster_visibility = 'members' AND EXISTS (
        SELECT 1 FROM community_members viewer_roster_cm
        WHERE viewer_roster_cm.community_id = c.id
          AND viewer_roster_cm.user_id = ${currentUser.id}
          AND viewer_roster_cm.removed_at IS NULL
      )))`)
}
