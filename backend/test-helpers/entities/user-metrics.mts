import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestUserLegacyBookmarkMetrics(
  userId: string,
  counts: {
    topics: number
    posts: number
    users: number
    followers: number
  },
): Promise<void> {
  await write(sql`
    UPDATE user_metrics
    SET
      bookmarks__follow__topics_count = ${counts.topics},
      bookmarks__follow__posts_count = ${counts.posts},
      bookmarks__follow__users_count = ${counts.users},
      bookmarkers__follow_count = ${counts.followers}
    WHERE id = ${userId}
  `)
}
