import { beginTransaction, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeTargetInput } from './types.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

const POST_TYPE_PATHS = {
  article: 'article',
  blog_post: 'blog-post',
  data_point: 'data-point',
  discussion: 'discussion',
  link: 'link',
  review: 'review',
  story: 'discussion',
  topic_recommendation: 'topic-recommendations',
} as const

/**
 * Resolves the current, server-owned post-image placement; callers never provide legal keys.
 *
 * A placement on a post outside `view_public_post_eligibility` is not a copyright target. A
 * `claimant` gets the same rejection as for a placement that does not exist, so the form is not an
 * oracle for private or unpublished posts. `staff` get a distinct reason, since they are told
 * which of their own recommended targets cannot be approved.
 */
export async function resolveCopyrightImagePlacement(
  input: {
    postId: string
    imageId: string
    hostedUseUrl: string
  },
  {
    audience,
    query = write,
  }: {
    audience: 'claimant' | 'staff'
    query?: typeof write | Awaited<ReturnType<typeof beginTransaction>>
  },
): Promise<CopyrightNoticeTargetInput> {
  const { rows } = await query<{
    post_id: string
    image_id: string
    placement_id: string
    placement_revision: number
    post_type: keyof typeof POST_TYPE_PATHS
    publicly_visible: boolean
    slug: string | null
  }>(sql`/* resolveCopyrightImagePlacement */
    SELECT pi.post_id, pi.image_id, placement.id AS placement_id,
      placement.revision AS placement_revision, p.post_type,
      public_post.post_id IS NOT NULL AS publicly_visible, slug.slug
    FROM post_images pi
    JOIN image_placements image_placement
      ON image_placement.post_id = pi.post_id AND image_placement.image_id = pi.image_id
    JOIN media_placements placement
      ON placement.id = image_placement.placement_id
      AND placement.retired_at IS NULL
    JOIN posts p ON p.id = pi.post_id AND p.deleted_at IS NULL
    LEFT JOIN view_public_post_eligibility public_post ON public_post.post_id = p.id
    JOIN images i ON i.id = pi.image_id
      AND i.deleted_at IS NULL AND i.upload_completed_at IS NOT NULL AND i.quarantine_pending_at IS NULL
    LEFT JOIN LATERAL (
      SELECT post_slugs.slug FROM post_slugs
      WHERE post_slugs.post_id = p.id
      ORDER BY post_slugs.created_at DESC LIMIT 1
    ) slug ON true
    WHERE pi.post_id = ${input.postId} AND pi.image_id = ${input.imageId}
  `)
  const placement = rows[0]
  // Claimants get the missing-target message for a hidden post, byte for byte.
  assert(
    placement && (placement.publicly_visible || audience === 'staff'),
    422,
    'Hosted image placement was not found',
  )
  assert(placement.publicly_visible, 422, 'Hosted image placement is not publicly visible')
  const path = POST_TYPE_PATHS[placement.post_type]
  assert(path, 422, 'Hosted image placement does not have a public post route')
  return {
    placementId: placement.placement_id,
    placementRevision: placement.placement_revision,
    imageId: placement.image_id,
    hostedUseUrl: new URL(
      `/${path}/${placement.slug || placement.post_id}`,
      SITEMAP_CONFIG.BASE_URL,
    ).href,
  }
}
