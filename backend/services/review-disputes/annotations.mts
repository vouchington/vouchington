import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PostDisputeAnnotation } from './config.mts'

const ANNOTATION_SELECT = sql`
  id, post_id, review_dispute_id, body_text, created_by_id, removed_at, removed_by_id
`

export async function getActiveAnnotationForPost(
  postId: string,
): Promise<PostDisputeAnnotation | null> {
  const { rows } = await read<PostDisputeAnnotation>(
    sql`/* getActiveAnnotationForPost */
    SELECT `.append(ANNOTATION_SELECT).append(sql`
    FROM post_dispute_annotations
    WHERE post_id = ${postId}
      AND removed_at IS NULL
    LIMIT 1
  `),
  )
  return rows[0] ?? null
}

export async function getActiveAnnotationsForPosts(
  postIds: string[],
): Promise<PostDisputeAnnotation[]> {
  if (postIds.length === 0) return []
  const { rows } = await read<PostDisputeAnnotation>(
    sql`/* getActiveAnnotationsForPosts */
    SELECT `.append(ANNOTATION_SELECT).append(sql`
    FROM post_dispute_annotations
    WHERE post_id = ANY(${postIds}::uuid[])
      AND removed_at IS NULL
  `),
  )
  return rows
}

export async function removeReviewDisputeAnnotation(
  staffUserId: string,
  annotationId: string,
): Promise<PostDisputeAnnotation> {
  const { rows } = await write<PostDisputeAnnotation>(
    sql`/* removeReviewDisputeAnnotation */
    UPDATE post_dispute_annotations
    SET removed_at = NOW(),
        removed_by_id = ${staffUserId}
    WHERE id = ${annotationId}
      AND removed_at IS NULL
    RETURNING `.append(ANNOTATION_SELECT),
  )
  const updated = rows[0]
  assert(updated, 404, 'Annotation not found or already removed')
  return updated
}
