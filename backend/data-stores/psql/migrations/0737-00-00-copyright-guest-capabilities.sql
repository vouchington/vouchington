-- Case-scoped guest access. The raw token is never stored. Email receipt and
-- thread correlation do not create a row.

CREATE TABLE copyright_notice_guest_capabilities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) BETWEEN 1 AND 256),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_notice_guest_capabilities__notice
  ON copyright_notice_guest_capabilities (copyright_notice_id);

CREATE TABLE copyright_notice_urgent_filings (
  copyright_notice_submission_id uuid PRIMARY KEY
    REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  classified_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(copyright_notice_submission_id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE copyright_notice_guest_capabilities IS 'Hashed, expiring, revocable capability for one copyright notice. Possession of mail or a thread is not a row.';
COMMENT ON TABLE copyright_notice_urgent_filings IS 'A filing whose kind can change a live legal clock. Absence means the filing is not urgent.';
