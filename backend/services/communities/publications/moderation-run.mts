import {
  beginTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import { enqueueClassifierRunDispatcher } from '@queues/ai-agents/enqueues/classifier-run'
import { requestClassifierRuns, type CurrentClassifierRunInput } from '@services/classifier-runs'
import { lockPostPublication } from '@services/post-publication'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * SQL over `post`: the post has text the classifier can read, the same fields as
 * `createPostModerationContent().texts`. A post without any has nothing to classify, so it never
 * requests a run instead of holding a request no provider call could ever settle.
 */
const POST_HAS_MODERATION_TEXT = `(
      post.title <> ''
      OR post.markdown <> ''
      OR (
        jsonb_typeof(post.structured_data -> 'bonus_requirements') = 'string'
        AND post.structured_data ->> 'bonus_requirements' <> ''
      )
      OR EXISTS (
        SELECT 1 FROM post_images image WHERE image.post_id = post.id AND image.caption <> ''
      )
    )`

/**
 * Locks a post that is still approved, unrejected and published in its community and reads the
 * moderation-content digest the community moderation run keys its receipt on. Null otherwise, so
 * an unpublished, rejected, deleted, textless or community-less post is never classified or acted on.
 */
export async function lockCommunityModerationInput(
  query: TransactionQuery,
  subject: { postId: string | null },
): Promise<CurrentClassifierRunInput | null> {
  if (subject.postId === null) throw new Error('community moderation subject must be a post')
  await lockPostPublication(query, subject.postId)
  const { rows } = await query<{ input_sha256: Buffer; community_id: string }>(
    sql`/* lockCommunityModerationInput */
    SELECT post.llm_moderation_content_sha256 AS input_sha256, review.community_id
    FROM posts post
    JOIN community_post_reviews review ON review.post_id = post.id
    WHERE post.id = ${subject.postId}
      AND post.deleted_at IS NULL
      AND review.approved_at IS NOT NULL
      AND review.rejected_at IS NULL
      AND review.unpublished_at IS NULL
      AND `.append(POST_HAS_MODERATION_TEXT).append(sql`
    FOR UPDATE OF post, review`),
  )
  const row = rows[0]
  return row ? { inputSha256: row.input_sha256, communityId: row.community_id } : null
}

/** SQL over `request` selecting requests whose post is still published at the requested content. */
export function communityModerationRequestEligibility(): SQLStatement {
  return sql`EXISTS (
      SELECT 1
      FROM posts post
      JOIN community_post_reviews review ON review.post_id = post.id
      WHERE post.id = request.post_id
        AND post.deleted_at IS NULL
        AND review.approved_at IS NOT NULL
        AND review.rejected_at IS NULL
        AND review.unpublished_at IS NULL
        AND post.llm_moderation_content_sha256 = request.input_sha256
        AND `.append(POST_HAS_MODERATION_TEXT).append(sql`
    )`)
}

/**
 * Requests the community moderation run for a post in the caller's transaction, so the request
 * commits or rolls back with the publication change that made the post eligible. The shared
 * dispatcher is enqueued only after that transaction commits; the durable request is what the
 * sweep recovers from if the enqueue is lost. Returns false, writing nothing, when the post is not
 * currently eligible.
 */
export async function requestCommunityModerationRun(
  query: TransactionQuery,
  postId: string,
): Promise<boolean> {
  const subject = { postId, rssFeedItemId: null }
  const current = await lockCommunityModerationInput(query, subject)
  if (!current) return false
  await requestClassifierRuns(query, {
    subject,
    inputSha256: current.inputSha256,
    classifierSlugs: [COMMUNITY_MODERATION_CLASSIFIER_SLUG],
  })
  registerPostCommitAction(query, async () => {
    await enqueueClassifierRunDispatcher({
      classifier: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
      postId,
      rssFeedItemId: null,
    })
  })
  return true
}

/**
 * Requests the run for a post in a transaction of its own, for the callers that have no lifecycle
 * transaction to join: the post-content-changed listener and post-created recovery. The request is
 * idempotent per content digest, so a replay of either never queues a second run.
 */
export async function requestCommunityModerationRunForPost(postId: string): Promise<boolean> {
  await using query = await beginTransaction()
  const requested = await requestCommunityModerationRun(query, postId)
  await query.commit()
  return requested
}
