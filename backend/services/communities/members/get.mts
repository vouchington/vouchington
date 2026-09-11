import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type {
  CommunityMember,
  CommunityMemberRole,
  CommunityMemberRosterVisibility,
} from '../types.mts'

export async function getCommunityMember(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<CommunityMember | null> {
  const { rows } = await read(
    sql`/* getCommunityMember */
    SELECT *
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
    LIMIT 1
    `,
    options,
  )
  return (rows[0] as CommunityMember) ?? null
}

export async function searchCommunityMembers(
  communityId: string,
  options?: QueryOptions & {
    currentUser?: PrivateUser | null
    role?: CommunityMemberRole
    limit?: number
    after?: string
    rosterVisibility?: CommunityMemberRosterVisibility
    viewerMembership?: CommunityMember | null
  },
): Promise<{ results: CommunityMember[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorName: string | undefined
  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorName = cursor.name
    cursorId = cursor.id
  }

  const query = sql`/* searchCommunityMembers */
    SELECT cm.*
    FROM community_members cm
    INNER JOIN users member_user ON member_user.id = cm.user_id
      AND member_user.deleted_at IS NULL
    WHERE cm.community_id = ${communityId}
      AND cm.removed_at IS NULL
  `

  appendVisibleMemberFilter(query, options)

  if (options?.role) {
    query.append(sql` AND cm.role = ${options.role}`)
  }

  if (cursorName !== undefined && cursorId !== undefined) {
    query.append(sql` AND cm.id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY cm.id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityMember[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityMember)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results[results.length - 1]!.id,
              id: results[results.length - 1]!.id,
            })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.id, id: results[0]!.id }) : null,
    },
  }
}

function appendVisibleMemberFilter(
  query: SQLStatement,
  options:
    | (QueryOptions & {
        currentUser?: PrivateUser | null
        rosterVisibility?: CommunityMemberRosterVisibility
        viewerMembership?: CommunityMember | null
      })
    | undefined,
) {
  const currentUser = options?.currentUser ?? null
  const rosterVisibility = options?.rosterVisibility ?? 'public'
  const canModerateRoster =
    currentUser?.roles.includes('administrator') ||
    options?.viewerMembership?.role === 'owner' ||
    options?.viewerMembership?.role === 'moderator'

  if (canModerateRoster) return

  const regularMembersVisible = communityRosterAllowsRegularMembers(
    rosterVisibility,
    currentUser,
    options?.viewerMembership,
  )
  if (!regularMembersVisible) {
    query.append(sql` AND cm.role IN ('owner', 'moderator')`)
    return
  }

  query.append(sql` AND (
    cm.role IN ('owner', 'moderator')
    OR `)
  appendUserMembershipPrivacyFilter(query, currentUser)
  query.append(sql`
  )`)
}

function communityRosterAllowsRegularMembers(
  rosterVisibility: CommunityMemberRosterVisibility,
  currentUser: PrivateUser | null,
  viewerMembership: CommunityMember | null | undefined,
): boolean {
  switch (rosterVisibility) {
    case 'public':
      return true
    case 'users':
      return !!currentUser
    case 'members':
      return !!viewerMembership && !viewerMembership.removed_at
    case 'moderators':
      return false
  }
}

export function appendUserMembershipPrivacyFilter(
  query: SQLStatement,
  currentUser: PrivateUser | null,
) {
  if (currentUser?.roles.includes('administrator')) {
    query.append(sql`TRUE`)
    return
  }
  if (!currentUser) {
    query.append(sql`member_user.community_memberships_visibility = 'everyone'`)
    return
  }
  query.append(sql`(
    cm.user_id = ${currentUser.id}
    OR member_user.community_memberships_visibility IN ('everyone', 'users')
    OR (
      member_user.community_memberships_visibility = 'followers'
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user rufu
        WHERE rufu.subject_id = ${currentUser.id}
          AND rufu.object_id = cm.user_id
          AND rufu.deleted_at IS NULL
      )
    )
    OR (
      member_user.community_memberships_visibility = 'mutual_followers'
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user viewer_follow
        WHERE viewer_follow.subject_id = ${currentUser.id}
          AND viewer_follow.object_id = cm.user_id
          AND viewer_follow.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user member_follow
        WHERE member_follow.subject_id = cm.user_id
          AND member_follow.object_id = ${currentUser.id}
          AND member_follow.deleted_at IS NULL
      )
    )
  )`)
}
