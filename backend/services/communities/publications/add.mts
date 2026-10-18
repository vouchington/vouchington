import { read, beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityPostReview } from '../types.mts'
import { assertCommunityPostTopicsNotMuted, type CategoryVoteState } from './muted-topics.mts'
import { recordPostPublicationChange } from '@services/post-publication'
import { requestCommunityModerationRun } from './moderation-run.mts'

async function createCommunityPostReviewWithOptions(
  currentUserId: string,
  postId: string,
  communityId: string,
  options: QueryOptions,
  categoryVoteState: CategoryVoteState,
): Promise<CommunityPostReview> {
  // The post and the community with the caller's standing arrive in one read; the checks below
  // keep their order: post first, then community, then membership and visibility.
  const { rows: loadRows } = await read(
    sql`/* createCommunityPostReview:load */
    SELECT
      p.id AS post_id,
      p.privacy,
      p.broadcast,
      p.deleted_at,
      p.community_id,
      c.id AS community_id_found,
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
        JOIN user_role_types urt ON urt.id = ur.role_type_id
        WHERE ur.user_id = ${currentUserId}
          AND urt.slug = 'administrator'
      ) AS current_user_is_admin
    FROM (SELECT 1) AS anchor
    LEFT JOIN posts p ON p.id = ${postId}
    LEFT JOIN communities c ON c.id = ${communityId}
      AND c.deleted_at IS NULL
    LEFT JOIN community_members cm
      ON cm.community_id = c.id
      AND cm.user_id = ${currentUserId}
      AND cm.removed_at IS NULL
    `,
    options,
  )
  const loaded = loadRows[0]!
  assert(loaded.post_id, 404, 'Post not found')
  assert(!loaded.deleted_at, 404, 'Post not found')
  assert(loaded.community_id === communityId, 422, 'Post does not belong to this community')
  assert(
    (loaded.broadcast === 'everyone' && loaded.privacy === 'public') ||
      (loaded.broadcast === 'users' && loaded.privacy === 'private'),
    422,
    'Community posts must be public for everyone or private for signed-in users',
  )

  assert(loaded.community_id_found, 404, 'Community not found')
  assert(!loaded.archived_at, 403, `Community is archived: ${communityId}`)
  assert(
    loaded.member_user_id || loaded.current_user_is_admin,
    403,
    `You are not a member of community: ${communityId}`,
  )
  assert(
    loaded.visibility === 'public' ||
      (loaded.broadcast === 'users' && loaded.privacy === 'private'),
    422,
    'Private community posts must be private for signed-in users',
  )

  await assertCommunityPostTopicsNotMuted(postId, communityId, options, categoryVoteState)

  const now = new Date().toISOString()
  const approvedAt =
    loaded.post_approval_required_at || loaded.raid_mode_post_approval_required ? null : now
  // reviewed_at must be set whenever approved_at is set (DB check constraint).
  const reviewedAt = approvedAt !== null ? now : null

  const { rows } = await write(
    sql`/* createCommunityPostReview */
    INSERT INTO community_post_reviews (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
    VALUES (${communityId}, ${postId}, ${currentUserId}, ${reviewedAt}::timestamptz, ${approvedAt}::timestamptz)
    ON CONFLICT (post_id) DO NOTHING
    RETURNING community_id, post_id, submitted_by_id, created_at, reviewed_at, reviewed_by_id,
      approved_at, rejected_at, rejection_reason, unpublished_at, unpublished_by_id,
      platform_override_at, platform_override_by_id, platform_override_action,
      platform_override_reason_code, platform_override_private_note, automod_action,
      automod_flagged_at, automod_flagged_content_sha256, automod_dismissed_at,
      automod_dismissed_by_id
    `,
    options,
  )

  assert(rows[0], 422, 'Post already has a community review')
  if (approvedAt) {
    await write(
      sql`/* recordAutomaticPublicationReviewChange */
        INSERT INTO community_post_review_changes (
          community_id, post_id, changed_by_id, change_type, is_platform_override
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
  // An administrator's post skips community moderation, as it skips the other creation checks.
  if (approvedAt && !loaded.current_user_is_admin) {
    await requestCommunityModerationRun(options.query as TransactionQuery, postId)
  }
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
    // Called within an external transaction: the community moderation request is written in it
    // and its dispatcher is enqueued once the owning transaction commits.
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
  return review
}
