import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isAdminUser } from '@services/users/authorization'
import type { CommunityRootPostType } from '../post-type-settings.mts'

export function appendEligiblePostTypeFilter(
  searchQuery: SQLStatement,
  currentUser: PrivateUser | null | undefined,
  eligiblePostType: CommunityRootPostType | undefined,
): void {
  if (!eligiblePostType) return
  assert(currentUser, 401, 'Unauthorized')
  const currentUserIsAdmin = isAdminUser(currentUser)
  searchQuery.append(sql`
    AND c.archived_at IS NULL
    AND (
      ${currentUserIsAdmin}
      OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id
          AND cm.user_id = ${currentUser.id}
          AND cm.removed_at IS NULL
      )
    )`)
  if (eligiblePostType === 'review') {
    searchQuery.append(sql` AND c.allow_review_posts = TRUE`)
  } else if (eligiblePostType === 'data_point') {
    searchQuery.append(sql` AND c.allow_data_point_posts = TRUE`)
  }
}
