import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'

export type ReportablePostAccessInput = {
  id: string
  created_by_id: string | null
  broadcast: 'everyone' | 'users' | 'followers' | 'mutual_followers'
  privacy: 'public' | 'private'
  clearance_status: string
  community_id?: string | null
}

export async function currentUserCanReportVisiblePost(
  currentUser: PrivateUser,
  post: ReportablePostAccessInput,
): Promise<boolean> {
  const isStaff = isModerationStaff(currentUser)
  if (
    !isStaff &&
    post.community_id &&
    !(await currentUserCanViewCommunityPost(currentUser, post))
  ) {
    return false
  }

  if (post.clearance_status !== 'approved' && !isStaff) {
    return currentUser.id === post.created_by_id
  }

  if (post.privacy === 'public') return true
  if (!post.created_by_id) return false
  return currentUserCanViewPrivatePost(currentUser, post.created_by_id, post.broadcast, isStaff)
}

async function currentUserCanViewCommunityPost(
  currentUser: PrivateUser,
  post: ReportablePostAccessInput,
): Promise<boolean> {
  const { rows } = await read<{ can_view: boolean }>(sql`/* currentUserCanReportCommunityPost */
    SELECT
      cpr.approved_at IS NOT NULL
      AND cpr.rejected_at IS NULL
      AND cpr.unpublished_at IS NULL
      AND (c.visibility = 'public' OR cm.user_id IS NOT NULL) AS can_view
    FROM posts p
    JOIN communities c
      ON c.id = p.community_id
      AND c.deleted_at IS NULL
    LEFT JOIN community_members cm
      ON cm.community_id = c.id
      AND cm.user_id = ${currentUser.id}
      AND cm.removed_at IS NULL
    LEFT JOIN community_post_reviews cpr
      ON cpr.community_id = c.id
      AND cpr.post_id = COALESCE(p.root_id, p.id)
    WHERE p.id = ${post.id}
      AND p.community_id = ${post.community_id}
    LIMIT 1
  `)
  return rows[0]?.can_view ?? false
}

async function currentUserCanViewPrivatePost(
  currentUser: PrivateUser,
  creatorId: string,
  broadcast: ReportablePostAccessInput['broadcast'],
  isStaff: boolean,
): Promise<boolean> {
  if (isStaff) return true
  if (currentUser.id === creatorId) return true
  if (broadcast === 'users') return true
  if (broadcast !== 'followers' && broadcast !== 'mutual_followers') return false

  const { rows } = await read<{ viewer_follows_creator: boolean; creator_follows_viewer: boolean }>(
    sql`/* currentUserCanReportPrivatePost */
      SELECT
        EXISTS (
          SELECT 1
          FROM relation__user__follow__user
          WHERE subject_id = ${currentUser.id}
            AND object_id = ${creatorId}
            AND deleted_at IS NULL
        ) AS viewer_follows_creator,
        EXISTS (
          SELECT 1
          FROM relation__user__follow__user
          WHERE subject_id = ${creatorId}
            AND object_id = ${currentUser.id}
            AND deleted_at IS NULL
        ) AS creator_follows_viewer
    `,
  )
  const relation = rows[0]
  if (broadcast === 'followers') return relation?.viewer_follows_creator ?? false
  return Boolean(relation?.viewer_follows_creator && relation.creator_follows_viewer)
}
