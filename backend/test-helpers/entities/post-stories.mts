import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestPostStory(
  postId: string,
  storyId: string,
  initiatedById: string,
): Promise<void> {
  await write(sql`/* insertTestPostStory */
    INSERT INTO story_posts (post_id, story_id, initiated_by_id)
    VALUES (${postId}, ${storyId}, ${initiatedById})
  `)
}

export async function deleteTestPostStory(postId: string): Promise<void> {
  await write(sql`/* deleteTestPostStory */ DELETE FROM story_posts WHERE post_id = ${postId}`)
}
