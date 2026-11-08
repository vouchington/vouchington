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
import { appendUserMembershipPrivacyFilter } from './member-privacy-filter.mts'

export async function getCommunityMember(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<CommunityMember | null> {
  const { rows } = await read(
    sql`/* getCommunityMember */
    SELECT id, community_id, user_id, role, approved_by_id, created_at, updated_at, removed_at, removed_by_id
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

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const roster = memberRosterFilter(options)
  if (roster === 'moderators' && options?.role === 'member')
    return {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  const walkOptions = { cursorId, roster, currentUser: options?.currentUser ?? null, limit }
  const page =
    roster === 'moderators' && !options?.role
      ? sql`SELECT id FROM (`
          .append(sql`(`)
          .append(buildMemberRosterWalk(communityId, { ...walkOptions, role: 'owner' }))
          .append(sql`) UNION ALL (`)
          .append(buildMemberRosterWalk(communityId, { ...walkOptions, role: 'moderator' }))
          .append(sql`)) roles ORDER BY id LIMIT ${limit + 1}`)
      : buildMemberRosterWalk(communityId, { ...walkOptions, role: options?.role })
  const query = sql`/* searchCommunityMembers */
    SELECT loaded.*
    FROM (`.append(page).append(sql`) page
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
      end_cursor: hasNextPage && end ? encodeCursor({ name: end.id, id: end.id }) : null,
      start_cursor: results[0] ? encodeCursor({ name: results[0].id, id: results[0].id }) : null,
    },
  }
}

function buildMemberRosterWalk(
  communityId: string,
  options: {
    cursorId: string | undefined
    role: CommunityMemberRole | undefined
    roster: 'all' | 'moderators' | 'privacy'
    currentUser: PrivateUser | null
    limit: number
  },
): SQLStatement {
  const needsPrivacy = options.roster === 'privacy' && (!options.role || options.role === 'member')
  const query = sql`
    SELECT cm.id
    FROM community_members cm
  `
  if (needsPrivacy) query.append(sql` INNER JOIN users member_user ON member_user.id = cm.user_id`)
  query.append(sql` WHERE cm.community_id = ${communityId}
      AND cm.removed_at IS NULL
  `)
  if (needsPrivacy) query.append(sql` AND member_user.deleted_at IS NULL`)
  else
    query.append(sql` AND (SELECT member_user.deleted_at IS NULL FROM users member_user
           WHERE member_user.id = cm.user_id) IS TRUE`)
  if (options.cursorId !== undefined) query.append(sql` AND cm.id > ${options.cursorId}`)
  if (options.role) appendMemberRoleFilter(query, options.role)
  if (needsPrivacy) appendMemberRosterVisibilityFilter(query, options.roster, options.currentUser)
  query.append(sql` ORDER BY cm.id ASC LIMIT ${options.limit + 1}`)
  return query
}

function appendMemberRoleFilter(query: SQLStatement, role: CommunityMemberRole): void {
  switch (role) {
    case 'owner':
      query.append(sql` AND cm.role = 'owner'`)
      return
    case 'moderator':
      query.append(sql` AND cm.role = 'moderator'`)
      return
    case 'member':
      query.append(sql` AND cm.role = 'member'`)
      return
    default: {
      const unexpected: never = role
      throw new Error(`Unexpected member role ${String(unexpected)}`)
    }
  }
}

function appendMemberRosterVisibilityFilter(
  query: SQLStatement,
  roster: 'all' | 'moderators' | 'privacy',
  currentUser: PrivateUser | null,
) {
  switch (roster) {
    case 'all':
    case 'moderators':
      return
    case 'privacy':
      query.append(sql` AND (cm.role IN ('owner', 'moderator') OR `)
      appendUserMembershipPrivacyFilter(query, currentUser)
      query.append(sql`)`)
      return
    default: {
      const unexpected: never = roster
      throw new Error(`Unexpected member roster ${String(unexpected)}`)
    }
  }
}

function memberRosterFilter(
  options:
    | (QueryOptions & {
        currentUser?: PrivateUser | null
        rosterVisibility?: CommunityMemberRosterVisibility
        viewerMembership?: CommunityMember | null
      })
    | undefined,
): 'all' | 'moderators' | 'privacy' {
  const currentUser = options?.currentUser ?? null
  const canModerateRoster =
    currentUser?.roles.includes('administrator') ||
    options?.viewerMembership?.role === 'owner' ||
    options?.viewerMembership?.role === 'moderator'
  if (canModerateRoster) return 'all'
  const regularMembersVisible = communityRosterAllowsRegularMembers(
    options?.rosterVisibility ?? 'public',
    currentUser,
    options?.viewerMembership,
  )
  return regularMembersVisible ? 'privacy' : 'moderators'
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
