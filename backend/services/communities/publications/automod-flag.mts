import { write, type TransactionQuery } from '@data-stores/psql'
import createError from 'http-errors'
import sql from 'sql-template-strings'

/**
 * Dismisses the open automod review-queue flag on a post: a moderator looked and no action is
 * needed. Only a current flag can be dismissed (still published, and computed for the post's
 * current content), and repeating the call on an already dismissed flag succeeds without
 * rewriting who dismissed it. A superseded, unpublished or missing flag is a 404.
 */
export async function dismissCommunityAutomodFlag(options: {
  communityId: string
  postId: string
  dismissedById: string
}): Promise<void> {
  const { communityId, postId, dismissedById } = options
  const { rows } = await write<{ flag_count: number }>(sql`/* dismissCommunityAutomodFlag */
    WITH current_flag AS (
      SELECT cpr.post_id, cpr.automod_flagged_content_sha256 AS flagged_digest,
        cpr.automod_dismissed_at
      FROM community_post_reviews cpr
      JOIN posts p ON p.id = cpr.post_id
      WHERE cpr.post_id = ${postId}
        AND cpr.community_id = ${communityId}
        AND cpr.automod_action = 'review_queue'
        AND cpr.automod_flagged_content_sha256 = p.llm_moderation_content_sha256
        AND cpr.approved_at IS NOT NULL
        AND cpr.rejected_at IS NULL
        AND cpr.unpublished_at IS NULL
        AND p.deleted_at IS NULL
    ), dismissed AS (
      UPDATE community_post_reviews cpr
      SET automod_dismissed_at = now(), automod_dismissed_by_id = ${dismissedById}
      FROM current_flag
      WHERE cpr.post_id = current_flag.post_id
        AND cpr.automod_flagged_content_sha256 = current_flag.flagged_digest
        AND cpr.automod_dismissed_at IS NULL
        AND current_flag.automod_dismissed_at IS NULL
      RETURNING cpr.post_id
    )
    SELECT count(*)::integer AS flag_count FROM current_flag
  `)
  if (!rows[0]?.flag_count) throw createError(404, 'Automod flag not found')
}

/**
 * Records the classifier's review-queue flag for the content it ran on, in the caller's
 * transaction (the classifier run's completion transaction). The post stays published; only a post
 * that is still approved, unrejected, published and not under platform override is flagged, so a
 * race with an unpublish or override leaves it alone. A new flag clears any earlier dismissal.
 */
export async function flagPostForAutomodReview(
  query: TransactionQuery,
  input: { communityId: string; postId: string; contentSha256: Buffer },
): Promise<boolean> {
  const { rowCount } = await write(
    sql`/* flagPostForAutomodReview */
    UPDATE community_post_reviews
    SET automod_action = 'review_queue',
        automod_flagged_at = CURRENT_TIMESTAMP,
        automod_flagged_content_sha256 = ${input.contentSha256},
        automod_dismissed_at = NULL,
        automod_dismissed_by_id = NULL
    WHERE community_id = ${input.communityId}
      AND post_id = ${input.postId}
      AND approved_at IS NOT NULL
      AND rejected_at IS NULL
      AND unpublished_at IS NULL
      AND platform_override_at IS NULL
    `,
    { query },
  )
  return (rowCount ?? 0) > 0
}
