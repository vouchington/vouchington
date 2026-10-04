-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Stable internal targets let reconciliation suppress stale notifications even after display FKs
-- are cleared by an entity hard delete. They are not exposed through the API contract.

CREATE INDEX IF NOT EXISTS idx_notifications__publication_post_id
ON notifications (publication_post_id)
WHERE publication_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__publication_rss_feed_item_id
ON notifications (publication_rss_feed_item_id)
WHERE publication_rss_feed_item_id IS NOT NULL;

CREATE FUNCTION fn_update_notification_publication_target() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.publication_post_id := COALESCE(NEW.publication_post_id, NEW.post_id);
    NEW.publication_rss_feed_item_id := COALESCE(
      NEW.publication_rss_feed_item_id,
      NEW.rss_feed_item_id
    );
  ELSE
    NEW.publication_post_id := COALESCE(
      NEW.publication_post_id,
      NEW.post_id,
      OLD.publication_post_id,
      OLD.post_id
    );
    NEW.publication_rss_feed_item_id := COALESCE(
      NEW.publication_rss_feed_item_id,
      NEW.rss_feed_item_id,
      OLD.publication_rss_feed_item_id,
      OLD.rss_feed_item_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notifications_preserve_publication_target
BEFORE INSERT OR UPDATE OF post_id, rss_feed_item_id ON notifications
FOR EACH ROW EXECUTE FUNCTION fn_update_notification_publication_target();

COMMENT ON COLUMN notifications.publication_post_id IS 'Stable post target retained after the display FK is cleared by hard deletion. References the retained post identity and does not grant live visibility.';
COMMENT ON COLUMN notifications.publication_rss_feed_item_id IS 'Stable RSS item target retained after the display FK is cleared by hard deletion. References the retained RSS item identity and does not grant live visibility.';

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__publication_post_id
  FOREIGN KEY (publication_post_id) REFERENCES retained_post_identities (id) ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE notifications VALIDATE CONSTRAINT fk_notifications__publication_post_id;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__publication_rss_feed_item_id
  FOREIGN KEY (publication_rss_feed_item_id) REFERENCES retained_rss_feed_item_identities (id) ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE notifications VALIDATE CONSTRAINT fk_notifications__publication_rss_feed_item_id;
COMMENT ON FUNCTION fn_update_notification_publication_target() IS 'Captures immutable content target IDs before nullable display FKs are cleared.';
