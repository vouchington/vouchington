import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
  type CappedCount,
} from '@services/users/profile-count-cap'
import type { CommunityMember } from '../types.mts'
import { appendUserMembershipPrivacyFilter } from './member-privacy-filter.mts'

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
    SELECT loaded.*
    FROM (
    SELECT cm.id
    FROM community_members cm
    INNER JOIN users member_user ON member_user.id = cm.user_id
    INNER JOIN communities c ON c.id = cm.community_id
    WHERE cm.user_id = ${targetUserId}
      AND cm.removed_at IS NULL
      AND member_user.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND `
  appendMemberCommunityVisibilityFilters(query, targetUserId, currentUser)
  if (cursorId) query.append(sql` AND cm.id > ${cursorId}`)
  query.append(sql` ORDER BY cm.id ASC LIMIT ${limit + 1}
    ) page
    INNER JOIN community_members loaded ON loaded.id = page.id
    ORDER BY page.id ASC`)
  const { rows } = await read<CommunityMember>(query, options)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  const end = results.at(-1)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, scope) : null,
      end_cursor: hasNextPage && end ? encodeScopedUuidCursor(end.id, scope) : null,
    },
  }
}

export async function countUserMemberCommunities(
  targetUserId: string,
  currentUser: PrivateUser | null,
  options?: QueryOptions,
): Promise<CappedCount> {
  const cap = getProfileCountCap()
  const query = sql`/* countUserMemberCommunities */
    SELECT COUNT(*) AS count FROM (
      SELECT 1
      FROM community_members cm
      INNER JOIN users member_user ON member_user.id = cm.user_id AND member_user.deleted_at IS NULL
      INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
      WHERE cm.user_id = ${targetUserId}
        AND cm.removed_at IS NULL
        AND `
  appendMemberCommunityVisibilityFilters(query, targetUserId, currentUser)
  query.append(sql`
      LIMIT ${profileCountProbeLimit(cap)}
    ) probe`)
  const { rows } = await read(query, options)
  return toCappedCount((rows[0] as { count: string }).count, cap)
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
