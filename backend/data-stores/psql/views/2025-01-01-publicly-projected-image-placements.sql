-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_publicly_projected_image_placements AS
SELECT registry.placement_id, registry.placement_revision, registry.image_id
FROM view_media_delivery_registry_current_records registry
JOIN images image ON image.id = registry.image_id
WHERE image.deleted_at IS NULL
  AND image.upload_completed_at IS NOT NULL
  AND image.quarantine_pending_at IS NULL
  AND image.is_flagged_by_openai_omni_moderation = FALSE
  AND image.openai_omni_moderation_results IS NOT NULL
  AND image.openai_omni_moderation_created_at IS NOT NULL
  AND registry.desired_state = 'allow'
  AND registry.state = 'completed';

COMMENT ON VIEW view_publicly_projected_image_placements IS
  'Usable images with completed allowed delivery in the current registry generation; read by the exact placement, revision and image tuple.';
