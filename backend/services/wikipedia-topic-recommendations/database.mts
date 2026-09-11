import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'

interface ContentItem {
  id: string
  title?: string
  content?: string
  categories?: string[]
  communityId: string | null
}

/**
 * Fetches recent posts for Wikipedia recommendation processing
 * Note: RSS feed support not implemented due to composite key complexity
 */
export async function getRecentContentIds(since: Date): Promise<{ postIds: string[] }> {
  const sincePostId = getMinUUIDv7ForDate(since)

  // Get recent posts (max 50)
  const postsResult = await read(
    `/* getRecentContentIds */
		SELECT id
		FROM posts
		WHERE id >= $1
		ORDER BY id DESC
		LIMIT 50
		`,
    [sincePostId],
  )

  const postIds = postsResult.rows.map((row: { id: string }) => row.id)

  return { postIds }
}

/**
 * Fetches posts by IDs
 */
export async function getPosts(ids: string[]): Promise<ContentItem[]> {
  if (ids.length === 0) return []

  const result = await read(
    `/* getPosts */
		SELECT id, title, markdown, community_id
		FROM posts
		WHERE id = ANY($1)
		`,
    [ids],
  )

  return result.rows.map(
    (row: {
      id: string
      title: string | null
      markdown: string | null
      community_id: string | null
    }) => ({
      id: row.id,
      title: row.title ?? undefined,
      content: row.markdown ?? undefined,
      communityId: row.community_id,
    }),
  )
}
