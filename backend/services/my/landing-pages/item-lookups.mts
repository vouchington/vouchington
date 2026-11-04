import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ProfileLink } from '../profile-links-types.mts'
import { buildReviewMap } from './shared.mts'
import type { LandingPageCandidateReview } from './types.mts'

export async function getLandingPageProfileLinksByIds(
  userId: string,
  ids: string[],
): Promise<Map<string, ProfileLink>> {
  if (ids.length === 0) return new Map()
  const { rows } = await read(sql`/* getProfileLinksByIds */
    SELECT pl.id, pl.user_id, pl.link_type, pl.sort_order, pl.url_id, u.url, pl.handle, pl.name, pl.image_id, pl.created_at, pl.updated_at,
      CASE WHEN public_delivery.placement_id IS NULL THEN NULL ELSE jsonb_build_object(
        'placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id
      ) END AS image_placement
    FROM user_profile_links pl
    LEFT JOIN urls u ON u.id = pl.url_id
    LEFT JOIN image_surface_placements surface
      ON surface.user_profile_link_id = pl.id AND surface.surface_kind = 'user-profile-link-image'
    LEFT JOIN media_placements placement
      ON placement.id = surface.placement_id AND placement.retired_at IS NULL
    LEFT JOIN view_publicly_projected_image_placements public_delivery
      ON public_delivery.placement_id = placement.id
      AND public_delivery.placement_revision = placement.revision
      AND public_delivery.image_id = surface.image_id
    WHERE pl.user_id = ${userId}
      AND pl.id = ANY(${ids}::uuid[])
  `)
  return new Map((rows as ProfileLink[]).map(link => [link.id, link]))
}
export async function getLandingPageReviewsByIds(
  userId: string,
  ids: string[],
  publicOnly: boolean,
): Promise<Map<string, LandingPageCandidateReview>> {
  if (ids.length === 0) return new Map()
  const query = sql`/* getReviewsByIds */
    SELECT
      p.id,
      p.title,
      p.declared_language,
      p.lingua_rs_detected_language,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = p.id
        ORDER BY id DESC
        LIMIT 1
      ) AS slug,
      p.markdown,
      p.created_at,
      prtr.topic_id,
      prtr.rating,
      prtr.order_index,
      t.name AS topic_name,
      t.slug AS topic_slug
    -- no-mistakes-disable-next-line postgres-required-predicates: merge repoints this topic reference to destination; deleted_at remains checked
    FROM posts p
    LEFT JOIN post_review_topic_ratings prtr ON prtr.post_id = p.id
    LEFT JOIN topics t ON t.id = prtr.topic_id AND t.deleted_at IS NULL
    WHERE p.created_by_id = ${userId}
      AND p.id = ANY(${ids}::uuid[])
      AND p.post_type = 'review'
      AND p.deleted_at IS NULL
  `
  if (publicOnly) {
    query.append(sql`
      AND EXISTS (
        SELECT 1
        FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = p.id
      )`)
  }
  query.append(sql` ORDER BY p.id DESC, prtr.order_index ASC`)
  const { rows } = await read(query)
  return buildReviewMap(rows)
}
