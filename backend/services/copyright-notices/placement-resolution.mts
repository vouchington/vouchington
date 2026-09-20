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

/** Resolves the current, server-owned post-image placement; callers never provide legal keys. */
export async function resolveCopyrightImagePlacement(
  input: {
    postId: string
    imageId: string
    hostedUseUrl: string
  },
  query: typeof write | Awaited<ReturnType<typeof beginTransaction>> = write,
): Promise<CopyrightNoticeTargetInput> {
  const { rows } = await query<{
    post_id: string
    image_id: string
    post_type: keyof typeof POST_TYPE_PATHS
    slug: string | null
  }>(sql`/* resolveCopyrightImagePlacement */
    SELECT pi.post_id, pi.image_id, p.post_type, slug.slug
    FROM post_images pi
    JOIN posts p ON p.id = pi.post_id AND p.deleted_at IS NULL
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
  assert(placement, 422, 'Hosted image placement was not found')
  const path = POST_TYPE_PATHS[placement.post_type]
  assert(path, 422, 'Hosted image placement does not have a public post route')
  return {
    placementKey: `post-image:${placement.post_id}:${placement.image_id}`,
    // #192 replaces this bridge revision with the authoritative placement revision on delivery.
    placementRevision: 0,
    imageId: placement.image_id,
    hostedUseUrl: new URL(
      `/${path}/${placement.slug || placement.post_id}`,
      SITEMAP_CONFIG.BASE_URL,
    ).href,
  }
}
