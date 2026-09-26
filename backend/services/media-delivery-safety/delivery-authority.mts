import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ImageDeliveryRecord } from './delivery-registry-types.mts'

/** Called only while the delivery's placement (or legacy image) fence is retained. */
export async function lockImageDeliveryLegalAuthority(
  query: QueryExecutor,
  record: Pick<ImageDeliveryRecord, 'route_kind' | 'placement_id'>,
): Promise<void> {
  if (record.route_kind === 'placement') {
    // Filing admission takes the notice lock. Hold it from proof through provider publication.
    await query(sql`/* imageDeliveryIsAuthorized:noticeLocks */
      SELECT notice.id FROM copyright_notices notice
      WHERE EXISTS (
        SELECT 1 FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = notice.id
          AND target.placement_key = concat('image-placement:', ${record.placement_id}::uuid)
      ) ORDER BY notice.id FOR NO KEY UPDATE
    `)
  }
}

export async function imageDeliveryIsAuthorized(
  query: QueryExecutor,
  record: Pick<
    ImageDeliveryRecord,
    'route_kind' | 'asset_id' | 'placement_id' | 'placement_revision'
  >,
): Promise<boolean> {
  await lockImageDeliveryLegalAuthority(query, record)
  const statement = sql`/* imageDeliveryIsAuthorized */ SELECT `
  statement.append(imageDeliveryAuthorityProof())
  statement.append(sql` AS allowed FROM (VALUES (${record.route_kind}::text, ${record.asset_id}::uuid,
    ${record.placement_id}::uuid, ${record.placement_revision}::integer))
    authority(route_kind, asset_id, placement_id, placement_revision)`)
  const { rows } = await query<{ allowed: boolean }>(statement)
  return rows[0]?.allowed ?? false
}

/** SQL predicate over an exact tuple named authority; shared by snapshot staging and locked publication. */
export function imageDeliveryAuthorityProof(): ReturnType<typeof sql> {
  return sql`EXISTS (
      SELECT 1 FROM images image
      WHERE image.id = authority.asset_id
        AND image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
        AND image.quarantine_pending_at IS NULL
        AND image.openai_omni_moderation_flagged = FALSE
        AND image.openai_omni_moderation_results IS NOT NULL
        AND image.openai_omni_moderation_created_at IS NOT NULL
        AND (
          (authority.route_kind = 'legacy-image'
            AND NOT EXISTS (SELECT 1 FROM post_images attachment WHERE attachment.image_id = image.id)
            AND NOT EXISTS (
              SELECT 1 FROM image_surface_placements surface JOIN media_placements placement
                ON placement.id = surface.placement_id
              WHERE surface.image_id = image.id AND placement.retired_at IS NULL
            ))
          OR (authority.route_kind = 'placement' AND EXISTS (
            SELECT 1 FROM media_placements placement
            WHERE placement.id = authority.placement_id
              AND placement.revision = authority.placement_revision
              AND placement.retired_at IS NULL AND placement.copyright_withheld_at IS NULL
              AND (
                EXISTS (SELECT 1 FROM image_placements binding JOIN posts post ON post.id = binding.post_id
                  WHERE binding.placement_id = placement.id AND binding.image_id = image.id
                    AND post.deleted_at IS NULL)
                OR EXISTS (
                  SELECT 1 FROM image_surface_placements surface
                  WHERE surface.placement_id = placement.id AND surface.image_id = image.id
                    AND (
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
                    )
                )
              )
              AND NOT EXISTS (
                SELECT 1 FROM copyright_notice_targets target
                WHERE target.placement_key = concat('image-placement:', placement.id)
                  AND (
                    EXISTS (SELECT 1 FROM copyright_restrictions restriction
                      WHERE restriction.copyright_notice_target_id = target.id AND restriction.lifted_at IS NULL)
                    OR EXISTS (
                      SELECT 1 FROM copyright_notice_submissions submission
                      WHERE submission.copyright_notice_id = target.copyright_notice_id
                        AND submission.kind = 'court_or_ccb_hold'
                        AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_assessments assessment
                          WHERE assessment.copyright_notice_submission_id = submission.id)
                    )
                    OR EXISTS (
                      SELECT 1 FROM copyright_notice_legal_hold_assessments hold
                      JOIN copyright_notice_submissions submission ON submission.id = hold.copyright_notice_submission_id
                      JOIN copyright_notice_legal_hold_assessment_targets scope
                        ON scope.copyright_notice_legal_hold_assessment_id = hold.id
                      WHERE submission.copyright_notice_id = target.copyright_notice_id
                        AND scope.copyright_notice_target_id = target.id
                        AND hold.from_original_claimant AND hold.same_material
                        AND hold.proceeding_kind IS NOT NULL AND hold.commenced_at IS NOT NULL
                        AND hold.received_by_designated_agent_at <= CURRENT_TIMESTAMP
                        AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
                          WHERE resolution.copyright_notice_legal_hold_assessment_id = hold.id)
                    )
                  )
              )
          ))
        )
    )`
}
