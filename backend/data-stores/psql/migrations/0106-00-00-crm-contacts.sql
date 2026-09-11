-- Coalesced pre-launch domain baseline.
-- Merged from: 0096-00-00-crm-contacts.sql

-- ==========================================================================
-- 0096-00-00-crm-contacts.sql
-- ============================================================================

-- CRM contacts must be defined before conversations so CRM identities can
-- participate in conversation_participants.

DO $$ BEGIN
  CREATE TYPE crm_contact_types AS ENUM ('influencer', 'customer', 'partner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crm_contact_sources AS ENUM ('csv_import', 'manual', 'inbound_email', 'referral');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crm_contact_verticals AS ENUM ('credit_cards', 'travel', 'cars', 'ai', 'technology', 'finance', 'lifestyle', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crm_social_platforms AS ENUM ('instagram', 'tiktok', 'youtube', 'x', 'linkedin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crm_email_providers AS ENUM ('ses', 'gmail_smtp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  vertical crm_contact_verticals,
  contact_type crm_contact_types NOT NULL DEFAULT 'influencer',
  source crm_contact_sources NOT NULL DEFAULT 'manual',
  follower_count INT CHECK (follower_count >= 0),
  notes TEXT,
  metadata JSONB,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contacted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  -- lifecycle FK (added in 0290)
  latest_lifecycle_change_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (name = TRIM(name)),
  CHECK (char_length(name) BETWEEN 1 AND 500),
  CONSTRAINT chk_crm_contacts__email_not_empty
    CHECK (trim(email) <> ''),
  CHECK (email = LOWER(TRIM(email))),
  CHECK (char_length(email) <= 320)
);

CREATE OR REPLACE TRIGGER trigger_crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts__email
  ON crm_contacts (email) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts__user_id
  ON crm_contacts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts__vertical
  ON crm_contacts (vertical) WHERE vertical IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts__assigned_to_id
  ON crm_contacts (assigned_to_id) WHERE assigned_to_id IS NOT NULL;

COMMENT ON TABLE crm_contacts IS 'CRM contact records for influencers, customers, and partners.';
COMMENT ON COLUMN crm_contacts.name IS 'Full display name of the contact.';
COMMENT ON COLUMN crm_contacts.email IS 'Primary email address, unique among non-archived contacts.';
COMMENT ON COLUMN crm_contacts.phone IS 'Optional phone number.';
COMMENT ON COLUMN crm_contacts.vertical IS 'Industry vertical the contact operates in.';
COMMENT ON COLUMN crm_contacts.contact_type IS 'Classification of the contact: influencer, customer, or partner.';
COMMENT ON COLUMN crm_contacts.source IS 'How the contact was added to the CRM.';
COMMENT ON COLUMN crm_contacts.follower_count IS 'Approximate total social media follower count.';
COMMENT ON COLUMN crm_contacts.notes IS 'Free-form internal notes about the contact.';
COMMENT ON COLUMN crm_contacts.metadata IS 'Additional structured metadata (e.g. from CSV import).';
COMMENT ON COLUMN crm_contacts.user_id IS 'Linked Voucha user account, set when contact converts.';
COMMENT ON COLUMN crm_contacts.assigned_to_id IS 'Admin user responsible for this contact.';
COMMENT ON COLUMN crm_contacts.created_by_id IS 'Admin user who created this contact record.';
COMMENT ON COLUMN crm_contacts.contacted_at IS 'When the first outbound message was sent to this contact.';
COMMENT ON COLUMN crm_contacts.responded_at IS 'When the contact first replied.';
COMMENT ON COLUMN crm_contacts.converted_at IS 'When the contact signed up / converted.';
COMMENT ON COLUMN crm_contacts.opted_out_at IS 'When the contact opted out of further communication.';
COMMENT ON COLUMN crm_contacts.archived_at IS 'When the contact was archived and removed from active lists.';
COMMENT ON COLUMN crm_contacts.created_at IS 'Timestamp derived from the UUIDv7 id.';
COMMENT ON COLUMN crm_contacts.updated_at IS 'Last modification timestamp, maintained by trigger.';
COMMENT ON COLUMN crm_contacts.latest_lifecycle_change_id IS 'Latest append-only lifecycle transition for this CRM contact.';

CREATE TABLE IF NOT EXISTS crm_contact_social_accounts (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  platform crm_social_platforms NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  follower_count INT CHECK (follower_count >= 0),
  follower_count_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (contact_id, platform),
  CHECK (handle = TRIM(handle)),
  CHECK (char_length(handle) BETWEEN 1 AND 200)
);

CREATE OR REPLACE TRIGGER trigger_crm_contact_social_accounts_updated_at
  BEFORE UPDATE ON crm_contact_social_accounts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE crm_contact_social_accounts IS 'Social media handles for CRM contacts, one row per platform.';
COMMENT ON COLUMN crm_contact_social_accounts.contact_id IS 'The contact this social account belongs to.';
COMMENT ON COLUMN crm_contact_social_accounts.platform IS 'Social media platform.';
COMMENT ON COLUMN crm_contact_social_accounts.handle IS 'Username or handle on the platform (without @ prefix).';
COMMENT ON COLUMN crm_contact_social_accounts.profile_url IS 'Full URL to the profile page.';
COMMENT ON COLUMN crm_contact_social_accounts.follower_count IS 'Follower count on this platform at last check.';
COMMENT ON COLUMN crm_contact_social_accounts.follower_count_updated_at IS 'When follower_count was last updated.';
COMMENT ON COLUMN crm_contact_social_accounts.created_at IS 'Timestamp derived from the UUIDv7 id.';
COMMENT ON COLUMN crm_contact_social_accounts.updated_at IS 'Last modification timestamp, maintained by trigger.';
