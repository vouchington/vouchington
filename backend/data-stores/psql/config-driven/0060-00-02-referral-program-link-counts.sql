-- The program row remains the exact counter; this indexed projection holds only eligible keys.
CREATE OR REPLACE FUNCTION fn_project_referral_program_link_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled_at IS NOT NULL AND NEW.disabled_at IS NULL
    AND NEW.active_link_count > 0
    AND EXISTS (
      SELECT 1 FROM topics topic
      WHERE topic.id = NEW.topic_id
        AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    ) THEN
    INSERT INTO referral_program_link_counts (topic_id, active_link_count)
    VALUES (NEW.topic_id, NEW.active_link_count)
    ON CONFLICT (topic_id) DO UPDATE
      SET active_link_count = EXCLUDED.active_link_count
      WHERE referral_program_link_counts.active_link_count IS DISTINCT FROM EXCLUDED.active_link_count;
  ELSE
    DELETE FROM referral_program_link_counts WHERE topic_id = NEW.topic_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_project_referral_program_link_counts() IS
  'Projects positive exact counts only for enabled referral programs whose topics remain live.';

CREATE OR REPLACE TRIGGER trigger_project_referral_program_link_counts
AFTER INSERT OR UPDATE OF active_link_count, enabled_at, disabled_at ON referral_program_topics
FOR EACH ROW EXECUTE FUNCTION fn_project_referral_program_link_counts();

-- A no-op count write takes the same program row lock as ordinary count writers, then invokes
-- their projection trigger after the topic lifecycle change is visible to this transaction.
CREATE OR REPLACE FUNCTION fn_update_referral_program_link_counts_on_topic_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE referral_program_topics
  SET active_link_count = active_link_count
  WHERE topic_id = NEW.id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_update_referral_program_link_counts_on_topic_lifecycle() IS
  'Refreshes one referral program search key after its topic is deleted, merged, or restored.';

CREATE OR REPLACE TRIGGER trigger_update_referral_program_link_counts_on_topic_lifecycle
AFTER UPDATE OF deleted_at, merged_into_topic_id ON topics
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.merged_into_topic_id IS DISTINCT FROM NEW.merged_into_topic_id)
EXECUTE FUNCTION fn_update_referral_program_link_counts_on_topic_lifecycle();
