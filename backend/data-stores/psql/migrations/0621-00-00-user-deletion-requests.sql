-- Durable, resumable account-deletion work references retained user identities, not live users.
CREATE OR REPLACE FUNCTION fn_lock_active_user_for_mutation(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_user_id::TEXT, 0));
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'user % does not exist', target_user_id
      USING ERRCODE = 'no_data_found';
  ELSIF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'user % cannot own new data after deletion', target_user_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_lock_active_user_for_mutation(UUID) IS
  'Serializes user-owned writes with account deletion and rejects writes after the privacy fence.';

CREATE TABLE IF NOT EXISTS user_deletion_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  requested_by_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  prior_username TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_attempt_id UUID NOT NULL DEFAULT uuidv7(),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_started_at TIMESTAMPTZ,
  processing_attempts INT NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  current_phase TEXT NOT NULL DEFAULT 'posts',
  completed_at TIMESTAMPTZ,
  last_error_message TEXT,
  CHECK (current_phase IN (
    'posts',
    'votes',
    'user-relations',
    'credentials',
    'account-data',
    'relation-impacts',
    'external-work',
    'finalize'
  )),
  CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 2000),
  CHECK (completed_at IS NULL OR processing_started_at IS NULL),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

CREATE OR REPLACE TRIGGER trigger_user_deletion_requests_updated_at
BEFORE UPDATE ON user_deletion_requests
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_deletion_requests__processing_attempt_id
ON user_deletion_requests (processing_attempt_id);

CREATE INDEX IF NOT EXISTS idx_user_deletion_requests__requested_by_id
ON user_deletion_requests (requested_by_id) WHERE requested_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_deletion_requests__recover_unstarted
ON user_deletion_requests (dispatched_at, id)
WHERE completed_at IS NULL AND processing_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_deletion_requests__recover_started
ON user_deletion_requests (processing_started_at, id)
WHERE completed_at IS NULL AND processing_started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_deletion_external_works (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  request_id UUID NOT NULL REFERENCES user_deletion_requests ON DELETE CASCADE,
  work_kind TEXT NOT NULL,
  work_key TEXT,
  relation_impact_id UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  last_error_message TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (work_kind IN (
    'cloudflare-cache-tag',
    'entity-relation-effects',
    's3-export',
    'stripe-customer'
  )),
  CHECK (char_length(work_key) <= 1024),
  CHECK (
    (work_kind = 'entity-relation-effects' AND work_key IS NULL
      AND (completed_at IS NOT NULL OR relation_impact_id IS NOT NULL))
    OR (work_kind <> 'entity-relation-effects' AND relation_impact_id IS NULL
      AND (completed_at IS NOT NULL OR work_key IS NOT NULL))
  ),
  CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 2000),
  UNIQUE (request_id, work_kind, work_key),
  UNIQUE (request_id, relation_impact_id)
);

CREATE OR REPLACE TRIGGER trigger_user_deletion_external_works_updated_at
BEFORE UPDATE ON user_deletion_external_works
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_deletion_external_works__pending
ON user_deletion_external_works (request_id, id)
WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_deletion_external_works__relation_impact
ON user_deletion_external_works (relation_impact_id, request_id)
WHERE relation_impact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_user_deletion_has_remaining_owned_data(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ownership RECORD;
  has_rows BOOLEAN;
BEGIN
  FOR ownership IN
    SELECT * FROM (VALUES
      ('posts', 'created_by_id'),
      ('post_topic_alias_sources', 'contributor_id'),
      ('user_email_addresses', 'user_id'),
      ('user_phone_numbers', 'user_id'),
      ('user_passkeys', 'user_id'),
      ('user_totp_authenticators', 'user_id'),
      ('api_keys', 'user_id'),
      ('user_sessions', 'user_id'),
      ('facebook_accounts', 'user_id'),
      ('apple_accounts', 'user_id'),
      ('google_accounts', 'user_id'),
      ('x_accounts', 'user_id'),
      ('linkedin_accounts', 'user_id'),
      ('microsoft_accounts', 'user_id'),
      ('github_accounts', 'user_id'),
      ('bluesky_link_completions', 'user_id'),
      ('bluesky_linked_accounts', 'user_id'),
      ('session_referral_attributions', 'user_id')
    ) AS configured(table_name, column_name)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)',
      ownership.table_name,
      ownership.column_name
    ) INTO has_rows USING target_user_id;
    IF has_rows THEN RETURN TRUE; END IF;
  END LOOP;

  FOR ownership IN
    SELECT DISTINCT table_name, 'user_id' AS column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'user_id'
      AND table_name LIKE '%\_votes' ESCAPE '\'
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE user_id = $1)',
      ownership.table_name
    ) INTO has_rows USING target_user_id;
    IF has_rows THEN RETURN TRUE; END IF;
  END LOOP;

  FOR ownership IN
    SELECT DISTINCT table_name, 'subject_id' AS column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'subject_id'
      AND table_name LIKE 'relation\_\_user\_\_%' ESCAPE '\'
      AND table_name NOT LIKE '%\_votes' ESCAPE '\'
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE subject_id = $1)',
      ownership.table_name
    ) INTO has_rows USING target_user_id;
    IF has_rows THEN RETURN TRUE; END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM lists WHERE owner_user_id = target_user_id AND removed_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM bluesky_link_authorizations
    WHERE user_id = target_user_id
      AND status IN ('pending', 'callback_claimed', 'handoff_ready', 'attached')
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM user_data_requests
    WHERE user_id = target_user_id
      AND (
        (completed_at IS NULL AND failed_at IS NULL)
        OR (completed_at IS NOT NULL AND failed_at IS NULL AND s3_key IS NOT NULL)
      )
  ) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION fn_user_deletion_has_remaining_owned_data(UUID) IS
  'Final fenced proof that no deletion-owned database rows remain before lifecycle completion.';

COMMENT ON TABLE user_deletion_requests IS 'Durable user-deletion lifecycle with timestamp-derived progress and fenced worker attempts.';
COMMENT ON COLUMN user_deletion_requests.user_id IS 'Deleted account identifier retained without a foreign key so the durable lifecycle survives hard deletion.';
COMMENT ON COLUMN user_deletion_requests.requested_by_id IS 'Audit actor identifier retained without a foreign key so the durable lifecycle survives requester deletion.';
COMMENT ON COLUMN user_deletion_requests.prior_username IS 'Username captured before profile scrubbing for deletion-phase cleanup.';
COMMENT ON COLUMN user_deletion_requests.queued_at IS 'Timestamp when the privacy fence committed and durable processing became eligible.';
COMMENT ON COLUMN user_deletion_requests.processing_attempt_id IS 'Fencing token rotated before each successor or stale recovery attempt.';
COMMENT ON COLUMN user_deletion_requests.dispatched_at IS 'Timestamp of the latest queue dispatch or recovery handoff.';
COMMENT ON COLUMN user_deletion_requests.processing_started_at IS 'Timestamp when the exact fencing attempt claimed processing.';
COMMENT ON COLUMN user_deletion_requests.processing_attempts IS 'Number of fenced processing attempts claimed for this request.';
COMMENT ON COLUMN user_deletion_requests.current_phase IS 'Ordered deletion phase; timestamps encode lifecycle state rather than an enum status.';
COMMENT ON COLUMN user_deletion_requests.completed_at IS 'Terminal marker written only after every deletion phase and external work item completes.';
COMMENT ON COLUMN user_deletion_requests.last_error_message IS 'Truncated diagnostic from the latest failed attempt; retry eligibility remains timestamp-derived.';
COMMENT ON TABLE user_deletion_external_works IS 'Required provider cleanup intents. Completion gates the final internal deletion marker.';
COMMENT ON COLUMN user_deletion_external_works.request_id IS 'Owning durable deletion request.';
COMMENT ON COLUMN user_deletion_external_works.work_kind IS 'Provider or internal side-effect category whose successful completion gates finalization.';
COMMENT ON COLUMN user_deletion_external_works.work_key IS 'Provider idempotency key while work is pending; cleared after completion and retention cleanup.';
COMMENT ON COLUMN user_deletion_external_works.relation_impact_id IS 'Typed pointer to an affected relation for internal effects work; cleared when completed impact history is pruned.';
COMMENT ON COLUMN user_deletion_external_works.requested_at IS 'Timestamp when the durable external-work intent was recorded.';
COMMENT ON COLUMN user_deletion_external_works.completed_at IS 'Timestamp when the external side effect completed successfully.';
COMMENT ON COLUMN user_deletion_external_works.last_error_message IS 'Truncated diagnostic from the latest failed external-work attempt.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_user_deletion_external_works__completed_audit
  ON user_deletion_external_works (request_id, id)
  WHERE completed_at IS NOT NULL
    AND work_key IS NOT NULL;
