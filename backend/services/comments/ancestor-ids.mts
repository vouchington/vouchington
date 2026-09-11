import { read } from '@data-stores/psql'

export const getCommentAncestorIds = async (postId: string): Promise<string[]> => {
  const { rows } = await read(
    `/* getCommentAncestorIds */
      WITH RECURSIVE ancestors AS (
        SELECT parent_id
        FROM posts
        WHERE id = $1
        UNION ALL
        SELECT posts.parent_id
        FROM posts
        JOIN ancestors ON posts.id = ancestors.parent_id
        WHERE posts.parent_id IS NOT NULL
          AND posts.post_type = 'comment'
      )
      SELECT parent_id AS id
      FROM ancestors
      WHERE parent_id IS NOT NULL
    `,
    [postId],
  )

  return rows.map(row => row.id as string)
}
