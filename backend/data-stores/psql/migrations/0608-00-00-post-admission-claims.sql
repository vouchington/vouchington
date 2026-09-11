CREATE TABLE IF NOT EXISTS post_admission_claims (
  reservation_id UUID PRIMARY KEY REFERENCES post_admission_reservations(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_admission_claims__expires_at
ON post_admission_claims (expires_at);

COMMENT ON TABLE post_admission_claims IS 'Short-lived exclusive leases that serialize execution of one admission reservation.';
COMMENT ON COLUMN post_admission_claims.reservation_id IS 'Admission reservation exclusively owned while this lease remains unexpired.';
COMMENT ON COLUMN post_admission_claims.lease_id IS 'Opaque fencing token rotated whenever an expired claim is taken over.';
COMMENT ON COLUMN post_admission_claims.expires_at IS 'Lease expiration after which another worker may take over the reservation.';
COMMENT ON COLUMN post_admission_claims.updated_at IS 'Last lease takeover timestamp used to audit claim ownership changes.';
