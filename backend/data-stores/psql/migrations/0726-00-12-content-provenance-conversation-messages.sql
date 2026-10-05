-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- conversation_messages is created in 0110, before oauth_clients (0636) and the immutability
-- function (0726-00-00) exist, so its foreign key and trigger land here. The foreign key is added
-- NOT VALID and validated in the same ledger entry; the table is empty when a fresh database
-- bootstraps, so the validation scan is short. Both statements apply to the partitioned parent
-- and cascade to every partition.

ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE conversation_messages
  VALIDATE CONSTRAINT conversation_messages_created_via_oauth_client_id_fkey;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_conversation_messages_content_provenance_immutable
  AFTER UPDATE ON conversation_messages
  FOR EACH ROW
  WHEN (
    OLD.created_via IS DISTINCT FROM NEW.created_via
    OR OLD.created_via_oauth_client_id IS DISTINCT FROM NEW.created_via_oauth_client_id
  )
  EXECUTE FUNCTION fn_reject_mutation();
