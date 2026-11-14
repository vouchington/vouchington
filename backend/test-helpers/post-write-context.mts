import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Keep a real ancestor write uncommitted while an independent delegated operation completes. */
export async function withHeldPostUpdateForTest<Result>(
  postId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(sql`/* withHeldPostUpdateForTest */
    UPDATE posts SET title = title WHERE id = ${postId}`)
  return await operation()
}

/** Commit a viewer's hide after the independent reply transaction has completed. */
export async function withUncommittedPostHideForTest<Result>(
  userId: string,
  postId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(sql`/* withUncommittedPostHideForTest */
    INSERT INTO relation__user__hide__post (subject_id, object_id)
    VALUES (${userId}, ${postId}) ON CONFLICT DO NOTHING`)
  const result = await operation()
  await query.commit()
  return result
}

export async function disableTestCommunityReviewPosts(communityId: string): Promise<void> {
  await write(sql`/* disableTestCommunityReviewPosts */
    UPDATE communities SET should_allow_review_posts = false WHERE id = ${communityId}`)
}

export async function makeTestPostPrivate(postId: string): Promise<void> {
  await write(sql`/* makeTestPostPrivate */
    UPDATE posts SET privacy = 'private', broadcast = 'users' WHERE id = ${postId}`)
}

export async function setTestPostMarkdown(postId: string, markdown: string): Promise<void> {
  await write(sql`/* setTestPostMarkdown */
    UPDATE posts SET markdown = ${markdown} WHERE id = ${postId}`)
}
