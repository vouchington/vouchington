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

  let cursorName: string | undefined
  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorName = cursor.name
    cursorId = cursor.id
  }

  const roster = memberRosterFilter(options)
  // The one-row fence and id bound keep a community that holds most of the table
  // on the active-membership index. A bare equality lets a custom plan walk the primary key.
  const afterId =
    cursorName !== undefined && cursorId !== undefined
      ? cursorId
      : '00000000-0000-0000-0000-000000000000'
  const query = sql`/* searchCommunityMembers */
    WITH membership_page AS MATERIALIZED (
      SELECT page.*
      FROM (SELECT ${communityId}::uuid AS community_id, ${afterId}::uuid AS after_id OFFSET 0) requested
      JOIN LATERAL (
        SELECT cm.*
        FROM community_members cm
        WHERE cm.community_id = requested.community_id
          AND cm.removed_at IS NULL
          AND cm.id > requested.after_id
  `
  if (options?.role) query.append(sql` AND cm.role = ${options.role}`)
  appendMemberRosterPageFilter(query, roster)
  query.append(sql`
        ORDER BY cm.community_id ASC, cm.id ASC
        LIMIT ${limit + 1}
      ) page ON TRUE
    )
    SELECT cm.*, (member_user.id IS NOT NULL) AS kept
    FROM membership_page cm
    LEFT JOIN LATERAL (
      SELECT live_user.id, live_user.community_memberships_visibility
      FROM users live_user
      WHERE live_user.id = cm.user_id
        AND live_user.deleted_at IS NULL
      LIMIT 1
    ) member_user ON TRUE
  `)
  appendMemberRosterVisibilityFilter(query, roster, options?.currentUser ?? null)
  query.append(sql` ORDER BY cm.id ASC`)

  const { rows } = await read<CommunityMember & { kept: boolean }>(query, options)
  const hasNextPage = rows.length > limit
  const inspected = rows.slice(0, limit)
  const results = inspected.flatMap(row => (row.kept ? [membershipWithoutKept(row)] : []))
  const end = inspected.at(-1)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && end ? encodeCursor({ name: end.id, id: end.id }) : null,
      start_cursor: results[0] ? encodeCursor({ name: results[0].id, id: results[0].id }) : null,
    },
  }
}

function membershipWithoutKept(row: CommunityMember & { kept: boolean }): CommunityMember {
  const { kept, ...member } = row
  void kept
  return member
}

function appendMemberRosterPageFilter(
  query: SQLStatement,
  roster: 'all' | 'moderators' | 'privacy',
) {
  switch (roster) {
    case 'all':
    case 'privacy':
      return
    case 'moderators':
      query.append(sql` AND cm.role IN ('owner', 'moderator')`)
      return
    default: {
      const unexpected: never = roster
      throw new Error(`Unexpected member roster ${String(unexpected)}`)
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
// oxlint-disable-next-line typescript/consistent-return -- Typed rosterVisibility switch is exhaustive; Oxlint misses its terminal flow.
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
