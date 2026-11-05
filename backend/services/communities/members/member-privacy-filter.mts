import type { PrivateUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'

export function appendUserMembershipPrivacyFilter(
  query: SQLStatement,
  currentUser: PrivateUser | null,
  memberUserId: 'cm.user_id' | 'member_user.id' = 'cm.user_id',
) {
  const memberId = memberUserId === 'member_user.id' ? sql`member_user.id` : sql`cm.user_id`
  if (currentUser?.roles.includes('administrator')) {
    query.append(sql`TRUE`)
    return
  }
  if (!currentUser) {
    query.append(sql`member_user.community_memberships_visibility = 'everyone'`)
    return
  }
  query.append(sql`(`)
  query.append(memberId)
  query.append(sql` = ${currentUser.id}
    OR member_user.community_memberships_visibility IN ('everyone', 'users')
    OR (
      member_user.community_memberships_visibility = 'followers'
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user rufu
        WHERE rufu.subject_id = ${currentUser.id}
          AND rufu.object_id = `)
  query.append(memberId)
  query.append(sql`
          AND rufu.deleted_at IS NULL
      )
    )
    OR (
      member_user.community_memberships_visibility = 'mutual_followers'
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user viewer_follow
        WHERE viewer_follow.subject_id = ${currentUser.id}
          AND viewer_follow.object_id = `)
  query.append(memberId)
  query.append(sql`
          AND viewer_follow.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user member_follow
        WHERE member_follow.subject_id = `)
  query.append(memberId)
  query.append(sql`
          AND member_follow.object_id = ${currentUser.id}
          AND member_follow.deleted_at IS NULL
      )
    )
  )`)
}
