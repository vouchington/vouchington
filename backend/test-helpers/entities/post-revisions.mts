import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function countPostImageRevisions(postId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countPostImageRevisions */
    SELECT count(*)::int AS count
    FROM post_revisions
    WHERE post_id = ${postId}
      AND post_images_changed
  `)
  return rows[0]?.count ?? 0
}

type CategoryRevisionEntry = {
  type: 'hashtag' | 'topic'
  hashtag?: string
  topic_id?: string
  topic_name?: string
}

export async function getLatestPostCategoryRevisionForTest(
  postId: string,
): Promise<{ before: CategoryRevisionEntry[]; after: CategoryRevisionEntry[] } | undefined> {
  const revision = await read<{ id: string }>(sql`/* getLatestPostCategoryRevisionForTest */
    SELECT id
    FROM post_revisions
    WHERE post_id = ${postId}
      AND revision_type = 'update'
      AND categories_changed
    ORDER BY id DESC
    LIMIT 1
  `)
  const revisionId = revision.rows[0]?.id
  if (!revisionId) return undefined
  const { rows } = await read<{
    side: 'before' | 'after'
    topic_id: string | null
    hashtag: string | null
    topic_name: string | null
  }>(sql`/* getLatestPostCategoryRevisionForTest.rows */
    SELECT side, topic_id, hashtag, topic_name
    FROM post_revision_categories
    WHERE revision_id = ${revisionId}
    ORDER BY side, position
  `)
  const before: CategoryRevisionEntry[] = []
  const after: CategoryRevisionEntry[] = []
  for (const row of rows) {
    const entry = categoryRevisionEntry(row)
    if (row.side === 'before') before.push(entry)
    else after.push(entry)
  }
  return { before, after }
}

function categoryRevisionEntry(row: {
  topic_id: string | null
  hashtag: string | null
  topic_name: string | null
}): CategoryRevisionEntry {
  if (row.hashtag != null) return { type: 'hashtag', hashtag: row.hashtag }
  return {
    type: 'topic',
    topic_id: row.topic_id ?? undefined,
    ...(row.topic_name == null ? {} : { topic_name: row.topic_name }),
  }
}
