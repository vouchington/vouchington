import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'

export type ReviewQueuePost = {
  id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  slug: string | null
  markdown_preview: string
  post_type: string
  created_by_id: string | null
  created_at: Date
  root_id: string | null
  root_post_type: string | null
  root_slug: string | null
  clearance_status: string
  clearance_updated_at: Date | null
  spam_detection_flagged: boolean | null
  spam_detection_score: number | null
  spam_detection_results: unknown
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_results: unknown
  media_context?: {
    requires_reveal: boolean
    images: Array<{
      image_id: string
      order_index: number
      caption: string
    }>
  }
}

export type SearchReviewQueueOptions = {
  limit: number
  after?: string | null
}

export type SearchReviewQueueResult = {
  results: ReviewQueuePost[]
  page_info: PageInfo
}

/**
 * Returns posts with derived clearance_status IN ('rejected', 'in_review') for admin review.
 * Includes spam detection and OpenAI moderation results for review context.
 */
export async function searchPostsForAdminReview(
  options: SearchReviewQueueOptions,
): Promise<SearchReviewQueueResult> {
  const { limit, after } = options
  const afterId = after
    ? decodeUuidCursor(after, isSimpleCursor, 'Invalid review queue cursor').id
    : null

  const query = sql`/* searchPostsForAdminReview */
    SELECT
      p.id,
      p.title,
      p.declared_language,
      p.lingua_rs_detected_language,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = p.id
        ORDER BY post_slugs.created_at DESC
        LIMIT 1
      ) AS slug,
      LEFT(p.markdown, 500) AS markdown_preview,
      p.post_type,
      p.created_by_id,
      p.created_at,
      p.root_id,
      root_post.post_type AS root_post_type,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = p.root_id
        ORDER BY post_slugs.created_at DESC
        LIMIT 1
      ) AS root_slug,
      clearance.clearance_status,
      clearance.clearance_updated_at,
      p.spam_detection_flagged,
      p.spam_detection_score,
      p.spam_detection_results,
      p.openai_omni_moderation_flagged,
      p.openai_omni_moderation_results,
      jsonb_build_object(
        'requires_reveal', p.openai_omni_moderation_flagged IS TRUE,
        'images', COALESCE(media.images, '[]'::jsonb)
      ) AS media_context
    FROM posts p
    LEFT JOIN posts root_post ON root_post.id = p.root_id
    JOIN view_post_clearance_status clearance ON clearance.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'image_id', bounded_images.image_id,
          'order_index', bounded_images.order_index,
          'caption', bounded_images.caption
        )
        ORDER BY bounded_images.order_index, bounded_images.image_id
      ) AS images
      FROM (
        SELECT pi.image_id, pi.order_index, pi.caption
        FROM post_images pi
        JOIN images i ON i.id = pi.image_id
        WHERE pi.post_id = p.id
          AND i.deleted_at IS NULL
          AND i.upload_completed_at IS NOT NULL
        ORDER BY pi.order_index, pi.image_id
        LIMIT 20
      ) bounded_images
    ) media ON true
    WHERE (p.rejected_at IS NOT NULL OR p.in_review_at IS NOT NULL)
      AND p.deleted_at IS NULL`

  if (afterId) {
    query.append(sql` AND p.id < ${afterId}`)
  }

  query.append(sql`
    ORDER BY p.id DESC
    LIMIT ${limit + 1}`)

  const { rows } = await read<ReviewQueuePost>(query)

  const hasNextPage = rows.length > limit
  if (hasNextPage) rows.pop()

  return {
    results: rows,
    page_info: buildPageInfo(rows, {
      hasNextPage,
      getCursor: post => ({ id: post.id }),
    }),
  }
}
