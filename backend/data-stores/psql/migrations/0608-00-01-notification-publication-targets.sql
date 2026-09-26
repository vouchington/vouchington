-- Stable internal targets let reconciliation suppress stale notifications even after display FKs
-- are cleared by an entity hard delete. They are not exposed through the API contract.

CREATE INDEX IF NOT EXISTS idx_notifications__publication_post_id
ON notifications (publication_post_id)
WHERE publication_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__publication_rss_feed_item_id
ON notifications (publication_rss_feed_item_id)
WHERE publication_rss_feed_item_id IS NOT NULL;

CREATE FUNCTION fn_preserve_notification_publication_target() RETURNS TRIGGER AS $$
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
FOR EACH ROW EXECUTE FUNCTION fn_preserve_notification_publication_target();

COMMENT ON COLUMN notifications.publication_post_id IS 'Stable post target retained after the display FK is cleared by hard deletion, for publication reconciliation only.';
COMMENT ON COLUMN notifications.publication_rss_feed_item_id IS 'Stable RSS item target retained after the display FK is cleared by hard deletion, for publication reconciliation only.';
COMMENT ON FUNCTION fn_preserve_notification_publication_target() IS 'Captures immutable content target IDs before nullable display FKs are cleared.';
