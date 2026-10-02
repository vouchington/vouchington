-- The batch table is created in 0330, before oauth_clients (0636) and the immutability function
-- (0726-00-00) exist, so its foreign key and trigger land here. Metadata-only change: the
-- foreign key is added NOT VALID and validated in the same ledger entry; the table holds one row
-- per submitted import, so the validation scan is short.

ALTER TABLE user_rss_feed_import_batches
  ADD CONSTRAINT user_rss_feed_import_batches_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE user_rss_feed_import_batches
  VALIDATE CONSTRAINT user_rss_feed_import_batches_created_via_oauth_client_id_fkey;

CREATE OR REPLACE TRIGGER user_rss_feed_import_batches_content_provenance_immutable
  AFTER UPDATE ON user_rss_feed_import_batches
  FOR EACH ROW
  WHEN (
    OLD.created_via IS DISTINCT FROM NEW.created_via
    OR OLD.created_via_oauth_client_id IS DISTINCT FROM NEW.created_via_oauth_client_id
  )
  EXECUTE FUNCTION fn_prevent_content_provenance_update();
