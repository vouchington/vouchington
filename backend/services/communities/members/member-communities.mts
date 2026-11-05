import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
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
  const seesOwnMemberships = currentUser?.id === targetUserId
  const query = sql`/* listUserMemberCommunities */
    WITH gate AS MATERIALIZED (
      SELECT member_user.id
      FROM users member_user
      WHERE member_user.id = ${targetUserId}
        AND member_user.deleted_at IS NULL
        AND `
  if (seesOwnMemberships) query.append(sql`TRUE`)
  else appendUserMembershipPrivacyFilter(query, currentUser, 'member_user.id')
  query.append(sql`
    ), membership_page AS MATERIALIZED (
      SELECT cm.*
      FROM community_members cm
      WHERE cm.user_id >= ${targetUserId}
        AND cm.user_id <= ${targetUserId}
        AND cm.removed_at IS NULL
        AND EXISTS (SELECT 1 FROM gate)
  `)
  if (cursorId) query.append(sql` AND cm.id > ${cursorId}`)
  query.append(sql`
      ORDER BY cm.user_id ASC, cm.id ASC
      LIMIT ${limit + 1}
    )
    SELECT cm.*, (c.id IS NOT NULL) AS kept
    FROM membership_page cm
    LEFT JOIN LATERAL (
      SELECT community.*
      FROM communities community
      WHERE community.id = cm.community_id
        AND community.deleted_at IS NULL
      LIMIT 1
    ) c ON TRUE
  `)
  if (!seesOwnMemberships) appendVisibleCommunityMembershipFilter(query, currentUser)
  query.append(sql` ORDER BY cm.user_id ASC, cm.id ASC`)
  const { rows } = await read<CommunityMember & { kept: boolean }>(query, options)
  const hasNextPage = rows.length > limit
  const inspected = rows.slice(0, limit)
  const results = inspected.flatMap(row => {
    if (!row.kept) return []
    const { kept, ...member } = row
    void kept
    return [member]
  })
  const end = inspected.at(-1)
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
