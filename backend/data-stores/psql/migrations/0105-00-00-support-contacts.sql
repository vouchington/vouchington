-- Coalesced pre-launch domain baseline.
-- Merged from: 0095-00-00-support-contacts.sql, 0310-00-00-customer-support.sql, 0420-00-00-support-inbound-email-message-ids.sql

-- ==========================================================================
-- 0095-00-00-support-contacts.sql
-- ============================================================================

-- Support contacts: individuals who contact support, identified by email address.
-- Defined here (before 0100-conversations) so conversations and messages can FK to it.
CREATE TABLE IF NOT EXISTS support_contacts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  email_address TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  user_id UUID REFERENCES users ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_support_contacts__email_address_lowercase
    CHECK (email_address = LOWER(TRIM(email_address))),
  CONSTRAINT chk_support_contacts__email_address_not_empty
    CHECK (trim(email_address) <> ''),
  CONSTRAINT chk_support_contacts__email_address_length
    CHECK (LENGTH(email_address) <= 320)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_contacts__email_address
  ON support_contacts (email_address);

CREATE INDEX IF NOT EXISTS idx_support_contacts__user_id
  ON support_contacts (user_id) WHERE user_id IS NOT NULL;

CREATE TRIGGER trigger_support_contacts_updated_at
  BEFORE UPDATE ON support_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE support_contacts IS 'Individuals who have interacted with customer support. May be linked to a registered user.';
COMMENT ON COLUMN support_contacts.email_address IS 'Unique lowercase email address for this contact.';
COMMENT ON COLUMN support_contacts.name IS 'Display name of the contact.';
COMMENT ON COLUMN support_contacts.notes IS 'Internal admin notes about this contact.';
COMMENT ON COLUMN support_contacts.user_id IS 'Linked registered user account, if any.';
