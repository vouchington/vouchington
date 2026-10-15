import { beginTransaction, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeTargetInput } from './types.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { ImageSurfaceReference } from '@services/media-delivery-safety/surface-lock'
import {
  resolveCopyrightSurfacePlacement,
  resolveCopyrightSurfacePlacements,
} from './placement-adapters/surface.mts'

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

type PostImageSelector = Extract<CopyrightImageSelector, { surfaceKind: 'post-image' }>
type PostPlacement = {
  input_index: number
  post_id: string | null
  image_id: string | null
  placement_id: string | null
  placement_revision: number | null
  post_type: keyof typeof POST_TYPE_PATHS | null
  slug: string | null
}

/** One placement read for all supplied post/image pairs; caller order controls validation. */
async function loadCopyrightPostImagePlacements(
  inputs: PostImageSelector[],
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<Map<number, PostPlacement>> {
  if (inputs.length === 0) return new Map()
  const { rows } = await query<PostPlacement>(sql`/* resolveCopyrightPostImagePlacements */
    SELECT input.input_index, selected.* FROM
      jsonb_to_recordset(${JSON.stringify(
        inputs.map((input, input_index) => ({
          input_index,
          post_id: input.postId,
          image_id: input.imageId,
        })),
      )}::jsonb) AS input(input_index integer, post_id uuid, image_id uuid)
    LEFT JOIN LATERAL (
      SELECT pi.post_id, pi.image_id, placement.id AS placement_id,
        placement.revision AS placement_revision, p.post_type, slug.slug
      FROM post_images pi
      JOIN image_placements image_placement
        ON image_placement.post_id = pi.post_id AND image_placement.image_id = pi.image_id
      JOIN media_placements placement ON placement.id = image_placement.placement_id
        AND placement.retired_at IS NULL
      JOIN posts p ON p.id = pi.post_id AND p.deleted_at IS NULL
      JOIN images i ON i.id = pi.image_id
        AND i.deleted_at IS NULL AND i.upload_completed_at IS NOT NULL
        AND i.quarantine_pending_at IS NULL
      LEFT JOIN LATERAL (
        SELECT post_slugs.slug FROM post_slugs
        WHERE post_slugs.post_id = p.id
        ORDER BY post_slugs.id DESC LIMIT 1
      ) slug ON true
      WHERE pi.post_id = input.post_id AND pi.image_id = input.image_id
    ) selected ON true
  `)
  const placements = new Map<number, PostPlacement>()
  for (const row of rows) {
    if (row.placement_id) placements.set(row.input_index, row)
  }
  return placements
}

export async function resolveCopyrightPostImagePlacements(
  inputs: PostImageSelector[],
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightNoticeTargetInput[]> {
  const placements = await loadCopyrightPostImagePlacements(inputs, query)
  return inputs.map((_, index) => {
    const placement = placements.get(index)
    assert(placement, 422, 'Hosted image placement was not found')
    return mapPostPlacement(placement)
  })
}

/** Resolves each family as a set, then reports the first invalid selector in request order. */
export async function resolveCopyrightImagePlacements(
  inputs: CopyrightImageSelector[],
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightNoticeTargetInput[]> {
  const posts = inputs.filter(
    (input): input is PostImageSelector => input.surfaceKind === 'post-image',
  )
  const surfaces = inputs.filter(
    (input): input is Exclude<CopyrightImageSelector, PostImageSelector> =>
      input.surfaceKind !== 'post-image',
  )
  const postPlacements = await loadCopyrightPostImagePlacements(posts, query)
  const surfacePlacements = await resolveCopyrightSurfacePlacements(surfaces, query)
  let postIndex = 0
  let surfaceIndex = 0
  return inputs.map(input => {
    if (input.surfaceKind === 'post-image') {
      const placement = postPlacements.get(postIndex++)
      assert(placement, 422, 'Hosted image placement was not found')
      return mapPostPlacement(placement)
    }
    const placement = surfacePlacements.get(surfaceIndex++)
    assert(placement, 422, 'Hosted image placement was not found')
    return placement
  })
}

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
      ORDER BY post_slugs.id DESC LIMIT 1
    ) slug ON true
    WHERE pi.post_id = ${input.postId} AND pi.image_id = ${input.imageId}
  `)
  const placement = rows[0]
  assert(placement, 422, 'Hosted image placement was not found')
  return mapPostPlacement({ ...placement, input_index: 0 })
}

function mapPostPlacement(placement: PostPlacement): CopyrightNoticeTargetInput {
  const path = placement.post_type && POST_TYPE_PATHS[placement.post_type]
  assert(path, 422, 'Hosted image placement does not have a public post route')
  return {
    bindingFamily: 'post',
    placementId: placement.placement_id!,
    placementRevision: placement.placement_revision!,
    imageId: placement.image_id!,
    hostedUseUrl: new URL(
      `/${path}/${placement.slug || placement.post_id}`,
      SITEMAP_CONFIG.BASE_URL,
    ).href,
  }
}
