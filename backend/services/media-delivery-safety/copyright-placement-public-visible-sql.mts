import { imageSurfaceOwnerIsLiveSql } from './surface-owner-live-sql.mts'
import sql from 'sql-template-strings'

/**
 * A public page exists for the exact target; correlated to alias `target`.
 *
 * Each branch is a scalar subquery, never `EXISTS`. Inside an `OR`, PostgreSQL can turn an
 * `EXISTS (... WHERE binding.placement_id = target.placement_id)` into an uncorrelated hashed
 * SubPlan that reads `view_public_post_eligibility`, or every surface owner, for every post in the
 * database once per execution. A scalar subquery is never hashed, so the placement id always drives
 * the lookup, whatever statistics the planner has. The primary key on `placement_id` bounds each
 * subquery to one row; `LIMIT 1` states that bound to the planner.
 */
export function copyrightPlacementPublicVisibleSql(): ReturnType<typeof sql> {
  const statement = sql`(
    (
      SELECT TRUE FROM image_placements binding
      JOIN view_public_post_eligibility public_post ON public_post.post_id = binding.post_id
      WHERE binding.placement_id = target.placement_id
      LIMIT 1
    ) IS TRUE OR (
      SELECT TRUE FROM image_surface_placements surface
      JOIN images image ON image.id = surface.image_id
      LEFT JOIN communities community ON community.id = surface.community_id
      WHERE surface.placement_id = target.placement_id
        AND `
  statement.append(imageSurfaceOwnerIsLiveSql())
  statement.append(sql` AND (surface.community_id IS NULL OR community.visibility = 'public')
      LIMIT 1
    ) IS TRUE
  )`)
  return statement
}
