import type { QueryExecutor } from '@data-stores/psql/types'
import { imageSurfaceOwnerIsLiveSql } from '@services/media-delivery-safety/surface-owner-live-sql'
import {
  imageSurfaceWhere,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety/surface-lock'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { getTopicTypeSlug } from '@voucha/types/entities/topic'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeTargetInput } from '../types.mts'

type SurfacePlacement = {
  input_index?: number
  placement_id: string
  placement_revision: number
  image_id: string
  surface_kind: ImageSurfaceReference['surfaceKind']
  user_id: string | null
  username: string | null
  topic_id: string | null
  topic_type: string | null
  topic_slug: string | null
  community_id: string | null
  community_slug: string | null
}

/** Resolves the bounded selector set with one snapshot query, keyed by caller order. */
export async function resolveCopyrightSurfacePlacements(
  references: Array<ImageSurfaceReference & { imageId: string }>,
  query: QueryExecutor,
): Promise<Map<number, CopyrightNoticeTargetInput>> {
  if (references.length === 0) return new Map()
  const input = references.map((reference, input_index) => ({
    input_index,
    surface_kind: reference.surfaceKind,
    owner_id:
      'userId' in reference
        ? reference.userId
        : 'topicId' in reference
          ? reference.topicId
          : 'communityId' in reference
            ? reference.communityId
            : reference.userProfileLinkId,
    image_id: reference.imageId,
  }))
  const { rows } = await query<SurfacePlacement>(
    sql`/* resolveCopyrightSurfacePlacements */
    SELECT input.input_index, selected.* FROM
      jsonb_to_recordset(${JSON.stringify(input)}::jsonb) AS input(
        input_index integer, surface_kind text, owner_id uuid, image_id uuid
      )
    LEFT JOIN LATERAL (
      SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id,
        surface.surface_kind, COALESCE(profile.id, link_owner.id) AS user_id,
        COALESCE(profile.username, link_owner.username) AS username,
        topic.id AS topic_id, topic.topic_type, topic.slug AS topic_slug,
        community.id AS community_id, community.slug AS community_slug
      FROM image_surface_placements surface
      JOIN media_placements placement ON placement.id = surface.placement_id
        AND placement.retired_at IS NULL
      JOIN images image ON image.id = surface.image_id
        AND image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
        AND image.quarantine_pending_at IS NULL
      LEFT JOIN users profile ON profile.id = surface.user_id
      LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
      LEFT JOIN users link_owner ON link_owner.id = link.user_id
      LEFT JOIN topics topic ON topic.id = surface.topic_id
      LEFT JOIN communities community ON community.id = surface.community_id
      WHERE surface.image_id = input.image_id
        AND surface.surface_kind::text = input.surface_kind
        AND COALESCE(surface.user_id, surface.user_profile_link_id,
          surface.topic_id, surface.community_id) = input.owner_id
        AND `.append(imageSurfaceOwnerIsLiveSql()).append(sql`
      ORDER BY placement.id DESC LIMIT 1
    ) selected ON true
  `),
  )
  const placements = new Map<number, CopyrightNoticeTargetInput>()
  for (const row of rows) {
    if (row.placement_id) placements.set(row.input_index!, mapSurfacePlacement(row))
  }
  return placements
}

/** Resolves one current surface binding, deriving the public URL from its live owner. */
export async function resolveCopyrightSurfacePlacement(
  reference: ImageSurfaceReference & { imageId: string },
  query: QueryExecutor,
): Promise<CopyrightNoticeTargetInput> {
  const statement = sql`/* resolveCopyrightSurfacePlacement */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id,
      surface.surface_kind, COALESCE(profile.id, link_owner.id) AS user_id,
      COALESCE(profile.username, link_owner.username) AS username,
      topic.id AS topic_id, topic.topic_type, topic.slug AS topic_slug,
      community.id AS community_id, community.slug AS community_slug
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
      AND placement.retired_at IS NULL
    JOIN images image ON image.id = surface.image_id
      AND image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
      AND image.quarantine_pending_at IS NULL
    LEFT JOIN users profile ON profile.id = surface.user_id
    LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
    LEFT JOIN users link_owner ON link_owner.id = link.user_id
    LEFT JOIN topics topic ON topic.id = surface.topic_id
    LEFT JOIN communities community ON community.id = surface.community_id
    WHERE surface.image_id = ${reference.imageId} AND `
  statement.append(imageSurfaceWhere(reference))
  statement.append(sql` AND `)
  statement.append(imageSurfaceOwnerIsLiveSql())
  statement.append(sql` ORDER BY placement.id DESC LIMIT 1`)
  const { rows } = await query<SurfacePlacement>(statement)
  const placement = rows[0]
  assert(placement, 422, 'Hosted image placement was not found')
  return mapSurfacePlacement(placement)
}

function mapSurfacePlacement(placement: SurfacePlacement): CopyrightNoticeTargetInput {
  let path: string
  if (
    placement.surface_kind === 'user-profile-image' ||
    placement.surface_kind === 'user-profile-link-image'
  ) {
    path = `/user/${placement.username ?? placement.user_id}`
  } else if (
    placement.surface_kind === 'topic-logo-image' ||
    placement.surface_kind === 'topic-hero-image'
  ) {
    path = `/${getTopicTypeSlug(placement.topic_type!)}/${placement.topic_slug ?? placement.topic_id}`
  } else {
    path = `/communities/${placement.community_slug ?? placement.community_id}`
  }
  return {
    bindingFamily: 'surface',
    placementId: placement.placement_id,
    placementRevision: placement.placement_revision,
    imageId: placement.image_id,
    hostedUseUrl: new URL(path, SITEMAP_CONFIG.BASE_URL).href,
  }
}
