import sql from 'sql-template-strings'

/** Liveness of the owner and the exact current image for aliases `surface` and `image`. */
export function imageSurfaceOwnerIsLiveSql(): ReturnType<typeof sql> {
  return sql`(
    (surface.surface_kind = 'user-profile-image' AND EXISTS (
      SELECT 1 FROM users owner WHERE owner.id = surface.user_id
        AND owner.deleted_at IS NULL AND owner.profile_image_id = image.id))
    OR (surface.surface_kind = 'user-profile-link-image' AND EXISTS (
      SELECT 1 FROM user_profile_links link JOIN users owner ON owner.id = link.user_id
      WHERE link.id = surface.user_profile_link_id AND link.image_id = image.id
        AND owner.deleted_at IS NULL))
    OR (surface.surface_kind IN ('topic-logo-image', 'topic-hero-image') AND EXISTS (
      SELECT 1 FROM topics owner WHERE owner.id = surface.topic_id
        AND owner.deleted_at IS NULL AND owner.merged_into_topic_id IS NULL
        AND CASE surface.surface_kind WHEN 'topic-logo-image' THEN owner.logo_image_id
          ELSE owner.hero_image_id END = image.id))
    OR (surface.surface_kind IN ('community-profile-image', 'community-banner-image') AND EXISTS (
      SELECT 1 FROM communities owner WHERE owner.id = surface.community_id
        AND owner.deleted_at IS NULL
        AND CASE surface.surface_kind WHEN 'community-profile-image' THEN owner.profile_image_id
          ELSE owner.banner_image_id END = image.id))
  )`
}
