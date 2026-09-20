import sql from 'sql-template-strings'

export function buildCommunityImagePlacementSelect() {
  return sql`,
    (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
     FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
     WHERE surface.surface_kind = 'community-profile-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
       AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
     ORDER BY placement.id DESC LIMIT 1) AS profile_image_placement,
    (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
     FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
     WHERE surface.surface_kind = 'community-banner-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
       AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
     ORDER BY placement.id DESC LIMIT 1) AS banner_image_placement`
}
