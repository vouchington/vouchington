import { imageSurfaceOwnerIsLiveSql } from '../media-delivery-safety/surface-owner-live-sql.mts'
import sql from 'sql-template-strings'

/** A public page exists for the exact target; correlated to alias `target`. */
export function copyrightPlacementPublicVisibleSql(): ReturnType<typeof sql> {
  const statement = sql`(
    EXISTS (
      SELECT 1 FROM image_placements binding
      JOIN view_public_post_eligibility public_post ON public_post.post_id = binding.post_id
      WHERE binding.placement_id = target.placement_id
    ) OR EXISTS (
      SELECT 1 FROM image_surface_placements surface
      JOIN images image ON image.id = surface.image_id
      LEFT JOIN communities community ON community.id = surface.community_id
      WHERE surface.placement_id = target.placement_id
        AND `
  statement.append(imageSurfaceOwnerIsLiveSql())
  statement.append(sql` AND (surface.community_id IS NULL OR community.visibility = 'public')
    )
  )`)
  return statement
}
