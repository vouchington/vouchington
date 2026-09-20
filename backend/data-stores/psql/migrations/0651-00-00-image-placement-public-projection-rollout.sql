CREATE OR REPLACE FUNCTION fn_image_placement_publicly_projected(
  p_placement_id uuid,
  p_revision integer,
  p_image_id uuid
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM images image
    WHERE image.id = p_image_id
      AND image.deleted_at IS NULL
      AND image.upload_completed_at IS NOT NULL
      AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged = FALSE
      AND image.openai_omni_moderation_results IS NOT NULL
      AND image.openai_omni_moderation_created_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM media_delivery_registry_records registry
        WHERE registry.delivery_key = concat('image-placement:', p_placement_id, ':', p_revision, ':', p_image_id)
          AND registry.desired_state = 'allow'
          AND registry.state = 'completed'
      )
  );
$$;

COMMENT ON FUNCTION fn_image_placement_publicly_projected(uuid, integer, uuid)
IS 'Projects only an exact image placement tuple that has completed its allowed edge delivery state.';
