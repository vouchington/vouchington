import { beginTransaction, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeTargetInput } from './types.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { ImageSurfaceReference } from '@services/media-delivery-safety/surface-lock'
import type { PrivateUser } from '@services/users/types'
import { canViewPostsBatch } from '@services/posts'
import { getCommunity } from '@services/communities/get'
import { getCommunityMember } from '@services/communities/members/get'
import { currentUserCanViewCommunity } from '@services/communities/authorization'
import { resolveCopyrightSurfacePlacement } from './placement-adapters/surface.mts'

export type CopyrightImageSelector =
  | { surfaceKind: 'post-image'; postId: string; imageId: string; hostedUseUrl: string }
  | (ImageSurfaceReference & { imageId: string; hostedUseUrl: string })

const POST_TYPE_PATHS = {
  article: 'article',
  blog_post: 'blog-post',
  data_point: 'data-point',
  discussion: 'discussion',
  link: 'link',
  review: 'review',
  story: 'story',
  topic_recommendation: 'topic-recommendations',
} as const

/** Resolves the current, server-owned post-image placement; callers never provide legal keys. */
export async function resolveCopyrightImagePlacement(
  input: CopyrightImageSelector,
  query: typeof write | Awaited<ReturnType<typeof beginTransaction>> = write,
): Promise<CopyrightNoticeTargetInput> {
  if (input.surfaceKind !== 'post-image') {
    return resolveCopyrightSurfacePlacement(input, query)
  }
  const { rows } = await query<{
    post_id: string
    image_id: string
    placement_id: string
    placement_revision: number
    post_type: keyof typeof POST_TYPE_PATHS
    slug: string | null
  }>(sql`/* resolveCopyrightImagePlacement */
    SELECT pi.post_id, pi.image_id, placement.id AS placement_id,
      placement.revision AS placement_revision, p.post_type, slug.slug
    FROM post_images pi
    JOIN image_placements image_placement
      ON image_placement.post_id = pi.post_id AND image_placement.image_id = pi.image_id
    JOIN media_placements placement
      ON placement.id = image_placement.placement_id
      AND placement.retired_at IS NULL
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
    bindingFamily: 'post',
    placementId: placement.placement_id,
    placementRevision: placement.placement_revision,
    imageId: placement.image_id,
    hostedUseUrl: new URL(
      `/${path}/${placement.slug || placement.post_id}`,
      SITEMAP_CONFIG.BASE_URL,
    ).href,
  }
}

/** The claimant must be able to see the named page; staff approval resolves without this gate. */
export async function claimantCanViewCopyrightImagePlacement(
  input: CopyrightImageSelector,
  currentUser: PrivateUser | null,
  query: typeof write | Awaited<ReturnType<typeof beginTransaction>>,
): Promise<boolean> {
  if (input.surfaceKind === 'post-image') {
    const viewable = await canViewPostsBatch(currentUser, [{ id: input.postId }], { query })
    return Boolean(viewable.get(input.postId))
  }
  if ('communityId' in input) {
    const community = await getCommunity(input.communityId, { query })
    if (!community) return false
    const membership = currentUser
      ? await getCommunityMember(input.communityId, currentUser.id, { query })
      : null
    return currentUserCanViewCommunity(currentUser, community, membership)
  }
  return true
}
