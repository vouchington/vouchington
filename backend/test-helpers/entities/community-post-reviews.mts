import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type InsertTestCommunityPostReviewOptions = {
  communityId: string
  postId: string
  submittedById?: string
  approvedAt?: Date
}

export async function insertTestCommunityPostReview(
  options: InsertTestCommunityPostReviewOptions,
): Promise<void> {
  const approvedAt = (options.approvedAt ?? new Date()).toISOString()
  await write(
    sql`/* insertTestCommunityPostReview */
    INSERT INTO community_post_reviews (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
    VALUES (${options.communityId}, ${options.postId}, ${options.submittedById ?? null}, ${approvedAt}::timestamptz, ${approvedAt}::timestamptz)
    ON CONFLICT (post_id) DO NOTHING
    `,
  )
}

export async function updateTestCommunityPostReviewState(options: {
  communityId: string
  postId: string
  approvedAt?: Date | null
  rejectedAt?: Date | null
  unpublishedAt?: Date | null
}): Promise<void> {
  await write(
    sql`/* updateTestCommunityPostReviewState */
    UPDATE community_post_reviews
    SET approved_at = CASE
          WHEN ${options.approvedAt !== undefined} THEN ${options.approvedAt === undefined ? null : options.approvedAt}::timestamptz
          ELSE approved_at
        END,
        rejected_at = CASE
          WHEN ${options.rejectedAt !== undefined} THEN ${options.rejectedAt === undefined ? null : options.rejectedAt}::timestamptz
          ELSE rejected_at
        END,
        unpublished_at = CASE
          WHEN ${options.unpublishedAt !== undefined} THEN ${options.unpublishedAt === undefined ? null : options.unpublishedAt}::timestamptz
          ELSE unpublished_at
        END,
        reviewed_at = CASE
          WHEN ${options.approvedAt !== undefined && options.approvedAt !== null} THEN ${options.approvedAt === undefined ? null : options.approvedAt}::timestamptz
          WHEN ${options.rejectedAt !== undefined && options.rejectedAt !== null} THEN ${options.rejectedAt === undefined ? null : options.rejectedAt}::timestamptz
          ELSE reviewed_at
        END
    WHERE community_id = ${options.communityId}
      AND post_id = ${options.postId}
    `,
  )
}

export async function insertTestPendingCommunityPostReview(options: {
  communityId: string
  postId: string
  submittedById?: string
}): Promise<void> {
  await write(
    sql`/* insertTestPendingCommunityPostReview */
    INSERT INTO community_post_reviews (community_id, post_id, submitted_by_id)
    VALUES (${options.communityId}, ${options.postId}, ${options.submittedById ?? null})
    ON CONFLICT (post_id) DO NOTHING
    `,
  )
}

export async function getCommunityPostReviewStatus(
  communityId: string,
  postId: string,
): Promise<
  | { approved_at: Date | null; unpublished_at: Date | null; unpublished_by_id: string | null }
  | undefined
> {
  const { rows } = await read(
    sql`/* getCommunityPostReviewStatus */
    SELECT approved_at, unpublished_at, unpublished_by_id
    FROM community_post_reviews
    WHERE community_id = ${communityId} AND post_id = ${postId}
    LIMIT 1
    `,
  )
  return rows[0] as
    | { approved_at: Date | null; unpublished_at: Date | null; unpublished_by_id: string | null }
    | undefined
}
