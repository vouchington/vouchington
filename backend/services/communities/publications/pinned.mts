import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import type { PrivateUser, BasicUser } from '@services/users/types'
import type { CommunityPinnedPost } from '../types.mts'
import { assertModeratorAccess } from './moderate.mts'
import {
  buildPrivacyFilter,
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import { recordModeratorAction } from '@services/moderator-actions'

export async function getPinnedPosts(
  communityId: string,
  currentUser?: BasicUser | null,
): Promise<CommunityPinnedPost[]> {
  const query = sql`/* getPinnedPosts */
    SELECT cpp.*
    FROM community_pinned_posts cpp
    JOIN community_post_reviews pub
      ON pub.community_id = cpp.community_id
      AND pub.post_id = cpp.post_id
      AND pub.approved_at IS NOT NULL
      AND pub.unpublished_at IS NULL
      AND pub.rejected_at IS NULL
    JOIN view_posts vp ON vp.id = cpp.post_id
    JOIN posts root_post ON root_post.id = COALESCE(vp.root_id, vp.id)
    WHERE cpp.community_id = ${communityId}
      AND vp.community_id = ${communityId}
      AND vp.deleted_at IS NULL
      AND vp.post_type != 'topic_recommendation'
  `

  const eligibility = currentUser
    ? buildViewerPostDiscoveryEligibilityFilter('vp', 'root_post', {
        currentUserId: currentUser.id,
        includeArchivedCommunities: true,
        isAdministrator: currentUser.roles.includes('administrator'),
      })
    : buildPublicPostEligibilityFilter('vp', 'root_post', { includeArchivedCommunities: true })
  query.append(sql` AND `).append(eligibility)

  query.append(sql` ORDER BY cpp.order_index ASC`)

  const { rows } = await read(query)
  return rows as CommunityPinnedPost[]
}

export async function getPinnedPostIds(
  communityId: string,
  currentUser?: BasicUser | null,
): Promise<string[]> {
  const pins = await getPinnedPosts(communityId, currentUser)
  return pins.map(p => p.post_id)
}

export async function setPinnedPosts(
  currentUser: PrivateUser,
  communityId: string,
  postIds: string[],
): Promise<CommunityPinnedPost[]> {
  assert(Array.isArray(postIds), 422, 'post_ids must be an array')
  assert(postIds.length <= 3, 422, 'Cannot pin more than 3 posts')
  assert(new Set(postIds).size === postIds.length, 422, 'Duplicate post IDs are not allowed')
  for (const postId of postIds) {
    assert(isUUID(postId), 422, `Invalid post ID: ${postId}`)
  }

  await assertModeratorAccess(currentUser, communityId)

  if (postIds.length > 0) {
    // Verify all posts are approved in this community and visible to the moderator
    const query = sql`/* setPinnedPosts:validate */
      SELECT cpp.post_id
      FROM community_post_reviews cpp
      JOIN view_posts vp ON vp.id = cpp.post_id
      WHERE cpp.community_id = ${communityId}
        AND cpp.post_id = ANY(${postIds}::uuid[])
        AND vp.community_id = ${communityId}
        AND vp.deleted_at IS NULL
        AND cpp.approved_at IS NOT NULL
        AND cpp.unpublished_at IS NULL
        AND cpp.rejected_at IS NULL
    `

    const privacyFilter = buildPrivacyFilter('vp', currentUser)
    if (privacyFilter) {
      query.append(sql` AND `).append(privacyFilter)
    }

    const { rows } = await read(query)
    const validIds = new Set((rows as { post_id: string }[]).map(r => r.post_id))
    for (const postId of postIds) {
      assert(validIds.has(postId), 422, `Post ${postId} is not an approved post in this community`)
    }
  }

  await using query = await beginTransaction()

  // Read and lock old pins inside the transaction so the diff is consistent
  const { rows: prevPinRows } = await query(sql`/* setPinnedPosts:lockOldPins */
      SELECT post_id FROM community_pinned_posts
      WHERE community_id = ${communityId}
      FOR UPDATE
    `)
  const prevPins = (prevPinRows as { post_id: string }[]).map(r => r.post_id)

  await query(sql`/* setPinnedPosts:delete */
      DELETE FROM community_pinned_posts
      WHERE community_id = ${communityId}
    `)

  let pins: CommunityPinnedPost[] = []
  if (postIds.length > 0) {
    const { rows } = await query(sql`/* setPinnedPosts:insert */
      INSERT INTO community_pinned_posts (community_id, post_id, order_index, pinned_by_id)
      SELECT ${communityId}, post_id, order_index, ${currentUser.id}
      FROM UNNEST(${postIds}::uuid[], ${postIds.map((_, i) => i)}::smallint[]) AS t(post_id, order_index)
      RETURNING *
    `)
    pins = rows as CommunityPinnedPost[]
  }
  await query.commit()
  const oldPins = prevPins

  // Log pin/unpin per changed post
  const oldSet = new Set(oldPins)
  const newSet = new Set(postIds)
  const pinned = postIds.filter(id => !oldSet.has(id))
  const unpinned = oldPins.filter((id: string) => !newSet.has(id))

  await Promise.all([
    ...pinned.map(postId =>
      recordModeratorAction(currentUser.id, { actionType: 'pin', communityId, postId }),
    ),
    ...unpinned.map(postId =>
      recordModeratorAction(currentUser.id, { actionType: 'unpin', communityId, postId }),
    ),
  ])

  return pins
}
