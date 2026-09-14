import { read, beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityPostReview } from '../types.mts'
import { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'
import { assertCommunityPostTopicsNotMuted, type CategoryVoteState } from './muted-topics.mts'
import { recordPostPublicationChange } from '@services/post-publication'

async function createCommunityPostReviewWithOptions(
  currentUserId: string,
  postId: string,
  communityId: string,
  options: QueryOptions,
  categoryVoteState: CategoryVoteState,
): Promise<CommunityPostReview> {
  // Validate post exists, is not deleted, and is scoped to this community.
  const { rows: postRows } = await read(
    sql`/* createCommunityPostReview */
    SELECT privacy, broadcast, deleted_at, community_id FROM posts WHERE id = ${postId}
    `,
    options,
  )
  assert(postRows[0], 404, 'Post not found')
  const post = postRows[0]!
  assert(!post.deleted_at, 404, 'Post not found')
  assert(post.community_id === communityId, 422, 'Post does not belong to this community')
  assert(
    (post.broadcast === 'everyone' && post.privacy === 'public') ||
      (post.broadcast === 'users' && post.privacy === 'private'),
    422,
    'Community posts must be public for everyone or private for signed-in users',
  )

  const { rows: communityRows } = await read(
    sql`/* createCommunityPostReview */
    SELECT
      c.id AS community_id,
      c.post_approval_required_at,
      EXISTS (
        SELECT 1
        FROM community_restrictions cr
        WHERE cr.community_id = c.id
          AND cr.restriction_type = 'require_post_approval'
          AND cr.lifted_at IS NULL
          AND (cr.expires_at IS NULL OR cr.expires_at > CURRENT_TIMESTAMP)
      ) AS raid_mode_post_approval_required,
      c.archived_at,
      c.visibility,
      cm.user_id AS member_user_id,
      EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN user_roles_types urt ON urt.id = ur.role_type_id
        WHERE ur.user_id = ${currentUserId}
          AND urt.slug = 'administrator'
      ) AS current_user_is_admin
    FROM communities c
    LEFT JOIN community_members cm
      ON cm.community_id = c.id
      AND cm.user_id = ${currentUserId}
      AND cm.removed_at IS NULL
    WHERE c.id = ${communityId}
      AND c.deleted_at IS NULL
    `,
    options,
  )

  assert(communityRows.length === 1, 404, 'Community not found')
  for (const row of communityRows) {
    assert(!row.archived_at, 403, `Community is archived: ${row.community_id}`)
    assert(
      row.member_user_id || row.current_user_is_admin,
      403,
      `You are not a member of community: ${row.community_id}`,
    )
    assert(
      row.visibility === 'public' || (post.broadcast === 'users' && post.privacy === 'private'),
      422,
      'Private community posts must be private for signed-in users',
    )
  }

  await assertCommunityPostTopicsNotMuted(postId, communityId, options, categoryVoteState)

  const now = new Date().toISOString()
  const approvedAt =
    communityRows[0]!.post_approval_required_at ||
    communityRows[0]!.raid_mode_post_approval_required
      ? null
      : now
  // reviewed_at must be set whenever approved_at is set (DB check constraint).
  const reviewedAt = approvedAt !== null ? now : null

  const { rows } = await write(
    sql`/* createCommunityPostReview */
    INSERT INTO community_post_reviews (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
    VALUES (${communityId}, ${postId}, ${currentUserId}, ${reviewedAt}::timestamptz, ${approvedAt}::timestamptz)
    ON CONFLICT (post_id) DO NOTHING
    RETURNING *
    `,
    options,
  )

  assert(rows[0], 422, 'Post already has a community review')
  if (approvedAt) {
    await write(
      sql`/* recordAutomaticPublicationReviewChange */
        INSERT INTO community_post_review_changes (
          community_id, post_id, actor_user_id, action, platform_override
        ) VALUES (
          ${communityId}, ${postId}, NULL, 'approve', false
        )`,
      options,
    )
  }
  await recordPostPublicationChange(options.query as TransactionQuery, {
    scope: { type: 'post', postId },
    reason: 'community_publication_changed',
    impactedCommunityIds: [communityId],
    footprint: { priorCommunityId: communityId },
  })
  return rows[0] as CommunityPostReview
}

export async function createCommunityPostReview(
  currentUserId: string,
  postId: string,
  communityId: string,
  options?: QueryOptions,
  categoryVoteState: CategoryVoteState = 'finalized',
): Promise<CommunityPostReview> {
  assert(isUUID(communityId), 422, `Invalid community id: ${communityId}`)

  if (options?.query) {
    // Called within an external transaction — return results only; the caller
    // must enqueue community moderation after the transaction commits.
    return createCommunityPostReviewWithOptions(
      currentUserId,
      postId,
      communityId,
      options,
      categoryVoteState,
    )
  }

  await using query = await beginTransaction()
  const review = await createCommunityPostReviewWithOptions(
    currentUserId,
    postId,
    communityId,
    { query },
    categoryVoteState,
  )
  await query.commit()

  // Fire-and-forget: enqueue community moderation for auto-approved reviews
  if (review.approved_at) {
    /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
    void enqueueBulkCommunityModerationDispatchers([{ postId, communityId: review.community_id }])
  }

  return review
}
