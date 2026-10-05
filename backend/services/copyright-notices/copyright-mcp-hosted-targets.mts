import assert from 'http-assert'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { getPostByAnyCached } from '@services/entity-fetch/get'
import { getPostImages } from '@services/posts/images'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { topicTypes } from '@voucha/types/entities/topic'
import { imageSurfaceOwnerIsLiveSql } from '@services/media-delivery-safety/surface-owner-live-sql'
import { boundedString } from './http-input.mts'

type HostedTarget = {
  surface: string
  image_id: string
  post_id: string | null
  user_id: string | null
  user_profile_link_id: string | null
  topic_id: string | null
  community_id: string | null
}
const postRoutes = {
  article: 'article',
  'blog-post': 'blog_post',
  'data-point': 'data_point',
  discussion: 'discussion',
  story: 'story',
  link: 'link',
  review: 'review',
} as const

/** Resolves at most two live bindings: zero is missing and two is ambiguous. */
export async function resolveCopyrightMcpHostedTarget(value: unknown) {
  assert(boundedString(value, 2048), 422, 'A hosted target URL is required')
  assert(
    !value.includes('\\') && !/\/(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(value),
    422,
    'Invalid hosted target URL',
  )
  let url: URL
  try {
    url = new URL(value)
  } catch {
    assert(false, 422, 'Invalid hosted target URL')
  }
  assert(
    [new URL(SITEMAP_CONFIG.BASE_URL).origin, 'https://voucha.ai'].includes(url.origin) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    422,
    'Invalid hosted target URL',
  )
  const segments = url.pathname.split('/').filter(Boolean)
  assert(segments.length === 2, 422, 'Invalid hosted target URL')
  const route = segments[0]!
  let identifier: string
  try {
    identifier = decodeURIComponent(segments[1]!)
  } catch {
    assert(false, 422, 'Invalid hosted target URL')
  }
  assert(
    identifier &&
      identifier !== '.' &&
      identifier !== '..' &&
      !identifier.includes('/') &&
      !identifier.includes('\\'),
    422,
    'Invalid hosted target URL',
  )
  const ownerId = isUUID(identifier) ? identifier : null
  const topicType = Object.entries(topicTypes).find(([, config]) => config.slug === route)?.[0]
  assert(
    Object.hasOwn(postRoutes, route) || route === 'user' || route === 'communities' || topicType,
    422,
    'Unsupported hosted target URL',
  )
  if (Object.hasOwn(postRoutes, route)) {
    const post = await getPostByAnyCached(identifier)
    assert(
      post && !post.deleted_at && post.post_type === postRoutes[route as keyof typeof postRoutes],
      422,
      'Hosted post was not found',
    )
    const images = await getPostImages(post.id)
    assert(images.length === 1, 422, 'Hosted target URL must identify exactly one live image')
    return {
      surface: 'post-image',
      image_id: images[0]!.image_id,
      post_id: post.id,
      target_url: url.href,
    }
  }
  const statement = sql`/* resolveCopyrightMcpHostedTarget */
      SELECT surface.surface_kind::text AS surface, image.id AS image_id, NULL::uuid AS post_id,
        surface.user_id, surface.user_profile_link_id, surface.topic_id, surface.community_id
      FROM image_surface_placements surface
      JOIN media_placements placement ON placement.id = surface.placement_id AND placement.retired_at IS NULL
      JOIN images image ON image.id = surface.image_id AND image.deleted_at IS NULL
        AND image.upload_completed_at IS NOT NULL AND image.quarantine_pending_at IS NULL
      LEFT JOIN users profile ON profile.id = surface.user_id
      LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
      LEFT JOIN users link_owner ON link_owner.id = link.user_id
      LEFT JOIN topics topic ON topic.id = surface.topic_id
      LEFT JOIN communities community ON community.id = surface.community_id
      WHERE (( ${route} = 'user' AND (
        COALESCE(profile.id, link_owner.id) = ${ownerId}::uuid OR
        COALESCE(profile.username, link_owner.username) = ${identifier}
      )) OR (${topicType ?? null}::text IS NOT NULL AND topic.topic_type::text = ${topicType ?? null}
        AND (topic.id = ${ownerId}::uuid OR topic.slug = ${identifier}))
      OR (${route} = 'communities' AND (community.id = ${ownerId}::uuid OR community.slug = ${identifier})))
      AND `
  statement.append(imageSurfaceOwnerIsLiveSql())
  statement.append(
    sql` AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)`,
  )
  statement.append(sql` LIMIT 2`)
  const { rows } = await write<HostedTarget>(statement)
  assert(rows.length === 1, 422, 'Hosted target URL must identify exactly one live image')
  const row = rows[0]!
  const owner = row.post_id
    ? { post_id: row.post_id }
    : row.user_id
      ? { user_id: row.user_id }
      : row.user_profile_link_id
        ? { user_profile_link_id: row.user_profile_link_id }
        : row.topic_id
          ? { topic_id: row.topic_id }
          : { community_id: row.community_id }
  return { surface: row.surface, image_id: row.image_id, target_url: url.href, ...owner }
}
