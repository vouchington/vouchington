-- Legal-process preservation holds on a user account (issue #1449). An open hold blocks account
-- deletion; the owner decides scope and duration on a lawyer's advice, so neither is stored.
-- Holds are never deleted: releasing writes released_at/released_by_id once, so the placement and
-- release facts persist as an audit trail. All three user references target the retained identity,
-- so the history outlives the user and a released hold never blocks the final hard delete.

CREATE TABLE IF NOT EXISTS user_legal_preservation_holds (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  account_user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  placed_by_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  reference_ciphertext TEXT NOT NULL CHECK (char_length(reference_ciphertext) BETWEEN 1 AND 4096),
  released_at TIMESTAMPTZ,
  released_by_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((released_at IS NULL) = (released_by_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_legal_preservation_holds__one_open
  ON user_legal_preservation_holds (account_user_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_legal_preservation_holds__account_user_id
  ON user_legal_preservation_holds (account_user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_legal_preservation_holds__placed_by_id
  ON user_legal_preservation_holds (placed_by_id);

CREATE INDEX IF NOT EXISTS idx_user_legal_preservation_holds__released_by_id
  ON user_legal_preservation_holds (released_by_id)
  WHERE released_by_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_reject_user_legal_preservation_hold_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal preservation holds are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.released_at IS NOT NULL
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.account_user_id IS DISTINCT FROM OLD.account_user_id
    OR NEW.placed_by_id IS DISTINCT FROM OLD.placed_by_id
    OR NEW.reference_ciphertext IS DISTINCT FROM OLD.reference_ciphertext THEN
    RAISE EXCEPTION 'legal preservation holds change only by a single release' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_user_legal_preservation_holds_reject_mutation
BEFORE UPDATE OR DELETE ON user_legal_preservation_holds
FOR EACH ROW EXECUTE FUNCTION fn_reject_user_legal_preservation_hold_mutation();

COMMENT ON TABLE user_legal_preservation_holds IS 'Staff-placed legal-process preservation holds on a user account (for example a DMCA 512(h) subpoena). A hold with released_at NULL is open and blocks account deletion; at most one hold per account is open at a time. Rows are append-only apart from a single release, and survive the account: every user reference targets retained_user_identities, so a released hold never blocks the 90-day hard delete and an open hold cannot coexist with a deleted account (placement refuses one). The owner decides scope and duration on a lawyer''s advice, so neither is stored.';
COMMENT ON COLUMN user_legal_preservation_holds.account_user_id IS 'Account whose records are preserved; the retained identity shares the user id.';
COMMENT ON COLUMN user_legal_preservation_holds.placed_by_id IS 'Administrator who placed the hold.';
COMMENT ON COLUMN user_legal_preservation_holds.reference_ciphertext IS 'Encrypted short reference, such as a matter id, for the legal process; sensitive, shown only to administrators and never logged or copied to other audit rows.';
COMMENT ON COLUMN user_legal_preservation_holds.released_at IS 'When the hold was released; NULL while the hold is open.';
COMMENT ON COLUMN user_legal_preservation_holds.released_by_id IS 'Administrator who released the hold; set together with released_at.';
