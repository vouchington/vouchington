import { imageSurfaceOwnerIsLiveSql } from '../media-delivery-safety/surface-owner-live-sql.mts'
import sql from 'sql-template-strings'

/** Host liveness for aliases `post_binding`, `post`, `surface`, and `image`. */
export function copyrightPlacementHostIsLiveSql(): ReturnType<typeof sql> {
  const statement = sql`(
    (post_binding.placement_id IS NOT NULL AND post.deleted_at IS NULL)
    OR (surface.placement_id IS NOT NULL AND `
  statement.append(imageSurfaceOwnerIsLiveSql())
  statement.append(sql`))`)
  return statement
}
