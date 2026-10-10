import sql from 'sql-template-strings'

export function buildCommunityImagePlacementSelect() {
  return sql`,
    (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
     FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      JOIN view_publicly_projected_image_placements public_delivery
        ON public_delivery.placement_id = placement.id
        AND public_delivery.placement_revision = placement.revision
        AND public_delivery.image_id = surface.image_id
     WHERE surface.surface_kind = 'community-profile-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
     ORDER BY placement.id DESC LIMIT 1) AS profile_image_placement,
    (SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
     FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      JOIN view_publicly_projected_image_placements public_delivery
        ON public_delivery.placement_id = placement.id
        AND public_delivery.placement_revision = placement.revision
        AND public_delivery.image_id = surface.image_id
     WHERE surface.surface_kind = 'community-banner-image' AND surface.community_id = c.id AND placement.retired_at IS NULL
     ORDER BY placement.id DESC LIMIT 1) AS banner_image_placement`
}
