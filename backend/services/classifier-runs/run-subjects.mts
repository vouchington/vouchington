import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { lockPostPublication } from '@services/post-publication'
import sql, { type SQLStatement } from 'sql-template-strings'
import { requestClassifierRuns } from './run-requests.mts'
import type { ClassifierRunSubject, CurrentClassifierRunInput } from './types.mts'

/**
 * Locks an approved post and reads the moderation-content digest every post classifier keys its
 * receipt on. Null when the post is gone or not approved, so an unapproved post is never run.
 */
export async function lockApprovedPostClassifierInput(
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
): Promise<CurrentClassifierRunInput | null> {
  if (subject.postId === null) throw new Error('post classifier subject must be a post')
  await lockPostPublication(query, subject.postId)
  const { rows } = await query<{ input_sha256: Buffer; community_id: string | null }>(sql`
    /* lockApprovedPostClassifierInput */
    SELECT llm_moderation_content_sha256 AS input_sha256, community_id FROM posts
    WHERE id = ${subject.postId} AND deleted_at IS NULL AND approved_at IS NOT NULL FOR UPDATE
  `)
  const post = rows[0]
  return post ? { inputSha256: post.input_sha256, communityId: post.community_id } : null
}

/** Locks a live feed item and reads its content digest; feed items belong to no community. */
export async function lockRssFeedItemClassifierInput(
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
): Promise<CurrentClassifierRunInput | null> {
  if (subject.rssFeedItemId === null) throw new Error('feed item classifier subject is required')
  const { rows } = await query<{ input_sha256: Buffer }>(sql`
    /* lockRssFeedItemClassifierInput */
    SELECT bedrock_nova_multimodal_v1_content_sha256 AS input_sha256 FROM rss_feed_items
    WHERE id = ${subject.rssFeedItemId} AND deleted_at IS NULL
      AND bedrock_nova_multimodal_v1_content_sha256 IS NOT NULL
    FOR UPDATE
  `)
  const item = rows[0]
  return item ? { inputSha256: item.input_sha256, communityId: null } : null
}

/** SQL over `request` selecting requests whose post is still approved at the requested content. */
export function approvedPostRequestEligibility(extra: SQLStatement = sql``): SQLStatement {
  return sql`EXISTS (
      SELECT 1 FROM posts post
      WHERE post.id = request.post_id AND post.deleted_at IS NULL AND post.approved_at IS NOT NULL
        AND post.llm_moderation_content_sha256 = request.input_sha256`.append(extra).append(sql`
    )`)
}

/**
 * Requests classifier runs for a post that was created already approved, so it never passes through
 * the approval decision that normally writes them. No-op when the post is not approved.
 */
export async function requestApprovedPostClassifierRuns(
  postId: string,
  classifierSlugs: readonly string[],
): Promise<void> {
  const subject = { postId, rssFeedItemId: null }
  await using transaction = await beginTransaction()
  const current = await lockApprovedPostClassifierInput(transaction, subject)
  if (current) {
    await requestClassifierRuns(transaction, {
      subject,
      inputSha256: current.inputSha256,
      classifierSlugs,
    })
  }
  await transaction.commit()
}
