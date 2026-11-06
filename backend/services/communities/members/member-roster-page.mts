import type { CommunityMemberRole } from '../types.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export type MemberRoster = 'all' | 'moderators' | 'privacy'

/** Null means every live role. The moderator roster is the only two-role page. */
export function membershipPageRoles(
  role: CommunityMemberRole | undefined,
  roster: MemberRoster,
): CommunityMemberRole[] | null {
  const rosterRoles: readonly CommunityMemberRole[] | null =
    roster === 'moderators' ? ['owner', 'moderator'] : null
  if (role && rosterRoles) return rosterRoles.includes(role) ? [role] : []
  if (role) return [role]
  return rosterRoles ? [...rosterRoles] : null
}

/**
 * Index-only id page. One role is a SQL literal. A role parameter, including
 * `role = ANY($roles)`, makes a generic plan filter regular members inside the limit.
 * Two roles each get an ordered scan, then merge.
 */
export function appendMembershipPageSource(
  query: SQLStatement,
  roles: CommunityMemberRole[] | null,
  limit: number,
): void {
  const pageSize = limit + 1
  if (roles === null) {
    query.append(sql`
      JOIN LATERAL (
        SELECT cm.id
        FROM community_members cm
        WHERE cm.community_id = requested.community_id
          AND cm.removed_at IS NULL
          AND cm.id > requested.after_id
        ORDER BY cm.community_id ASC, cm.id ASC
        LIMIT ${pageSize}
      ) page ON TRUE`)
    return
  }
  if (roles.length !== 2) {
    appendSingleRolePage(query, roles[0], pageSize)
    return
  }
  query.append(sql`
    JOIN LATERAL (
      SELECT merged.id FROM (
        (
          SELECT owner_page.id
          FROM (SELECT 1) owner_anchor
          JOIN LATERAL (
            SELECT cm.id
            FROM community_members cm
            WHERE cm.community_id = requested.community_id
              AND cm.removed_at IS NULL
              AND cm.id > requested.after_id
              AND cm.role = 'owner'::community_member_roles
            ORDER BY cm.id ASC
            LIMIT ${pageSize}
          ) owner_page ON TRUE
        )
        UNION ALL
        (
          SELECT moderator_page.id
          FROM (SELECT 1) moderator_anchor
          JOIN LATERAL (
            SELECT cm.id
            FROM community_members cm
            WHERE cm.community_id = requested.community_id
              AND cm.removed_at IS NULL
              AND cm.id > requested.after_id
              AND cm.role = 'moderator'::community_member_roles
            ORDER BY cm.id ASC
            LIMIT ${pageSize}
          ) moderator_page ON TRUE
        )
      ) merged
      ORDER BY merged.id ASC
      LIMIT ${pageSize}
    ) page ON TRUE`)
}

function appendSingleRolePage(
  query: SQLStatement,
  role: CommunityMemberRole | undefined,
  pageSize: number,
): void {
  if (role === undefined) {
    query.append(sql`
      JOIN LATERAL (
        SELECT cm.id FROM community_members cm WHERE false
      ) page ON TRUE`)
    return
  }
  const roleSql = singleRoleEquality(role)
  query.append(sql`
    JOIN LATERAL (
      SELECT cm.id
      FROM community_members cm
      WHERE cm.community_id = requested.community_id
        AND cm.removed_at IS NULL
        AND cm.id > requested.after_id
        AND `)
  query.append(roleSql)
  query.append(sql`
      ORDER BY cm.id ASC
      LIMIT ${pageSize}
    ) page ON TRUE`)
}

function singleRoleEquality(role: CommunityMemberRole): SQLStatement {
  switch (role) {
    case 'owner':
      return sql`cm.role = 'owner'::community_member_roles`
    case 'moderator':
      return sql`cm.role = 'moderator'::community_member_roles`
    case 'member':
      return sql`cm.role = 'member'::community_member_roles`
    default: {
      const unexpected: never = role
      throw new Error(`Unexpected member role ${String(unexpected)}`)
    }
  }
}
