import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestPostStory(
  postId: string,
  storyId: string,
  initiatedById: string,
): Promise<void> {
  await write(sql`/* insertTestPostStory */
    INSERT INTO post__stories (post_id, story_id, initiated_by_id)
    VALUES (${postId}, ${storyId}, ${initiatedById})
  `)
}

export async function deleteTestPostStory(postId: string): Promise<void> {
  await write(sql`/* deleteTestPostStory */ DELETE FROM post__stories WHERE post_id = ${postId}`)
}

/** Holds a newly inserted story-post association before commit for capture race tests. */
export async function insertTestPostStoryAndWaitBeforeCommit(
  postId: string,
  storyId: string,
  initiatedById: string,
  releaseCommit: Promise<void>,
  onInserted: () => void,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* insertTestPostStoryAndWaitBeforeCommit.lifecycleLock */
        SELECT pg_advisory_xact_lock(hashtextextended('story-lifecycle:' || $1::text, 0))`,
      [storyId],
    )
    await query(sql`/* insertTestPostStoryAndWaitBeforeCommit */
        INSERT INTO post__stories (post_id, story_id, initiated_by_id)
        VALUES (${postId}, ${storyId}, ${initiatedById})
      `)
    onInserted()
    await releaseCommit
    await transaction.commit()
  }
}
