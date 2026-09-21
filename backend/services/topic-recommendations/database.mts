import { read } from '@data-stores/psql'

interface ContentItem {
  id: string
  title?: string
  content?: string
  categories?: string[]
  communityId: string | null
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
