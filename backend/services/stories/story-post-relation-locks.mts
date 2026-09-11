import type { QueryOptions } from '@data-stores/psql/types'

/** Matches user-deletion's topic-before-URL relation lock order. */
export async function lockStoryPostRelations(
  query: NonNullable<QueryOptions['query']>,
  postId: string,
): Promise<void> {
  await query(
    `/* lockStoryPostRelations:topics */ SELECT id
    FROM relation__post__category__topic WHERE subject_id = $1
    ORDER BY subject_id, object_id FOR UPDATE`,
    [postId],
  )
  await query(
    `/* lockStoryPostRelations:urls */ SELECT id
    FROM relation__post__related__url WHERE subject_id = $1
    ORDER BY subject_id, object_id FOR UPDATE`,
    [postId],
  )
}
