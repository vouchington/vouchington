import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Atomically change an owned post's audience and content without publication side effects. */
export async function makeTestRssPostPrivate(postId: string, markdown: string): Promise<void> {
  await write(sql`/* makeTestRssPostPrivate */
    UPDATE posts SET privacy = 'private', broadcast = 'users', markdown = ${markdown}
    WHERE id = ${postId}
  `)
}
