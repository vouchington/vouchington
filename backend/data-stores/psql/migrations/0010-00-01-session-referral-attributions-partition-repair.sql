-- Repair local/staging databases that recorded the pre-partitioned 0010 migration.
-- edited-in-place: pre-launch, never deployed to production
-- No rows are dropped: the old table is renamed aside, then copied into the
-- partitioned replacement before config-driven default partition creation runs.

DO $$
DECLARE
  session_referral_attributions_is_partitioned BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_partitioned_table pt
    JOIN pg_class parent ON parent.oid = pt.partrelid
    JOIN pg_namespace namespace ON namespace.oid = parent.relnamespace
    WHERE namespace.nspname = 'public'
      AND parent.relname = 'session_referral_attributions'
  ) INTO session_referral_attributions_is_partitioned;

  IF to_regclass('public.session_referral_attributions') IS NOT NULL
    AND NOT session_referral_attributions_is_partitioned THEN
    SET LOCAL lock_timeout = '5s';
    LOCK TABLE session_referral_attributions IN ACCESS EXCLUSIVE MODE;

    ALTER TABLE session_referral_attributions
      RENAME TO session_referral_attributions__legacy_nonpartitioned;
    ALTER INDEX IF EXISTS session_referral_attributions_pkey
      RENAME TO session_referral_attributions__legacy_nonpartitioned_pkey;
    ALTER INDEX IF EXISTS idx_session_referral_attributions__session_id_id
      RENAME TO idx_session_referral_attributions__legacy_session_id_id;
    ALTER INDEX IF EXISTS idx_session_referral_attributions__referrer_id
      RENAME TO idx_session_referral_attributions__legacy_referrer_id;
    ALTER INDEX IF EXISTS idx_session_referral_attributions__user_id
      RENAME TO idx_session_referral_attributions__legacy_user_id;
  END IF;
END $$;

-- Mirrors the CREATE TABLE in 0010-00-00-users-auth-oauth.sql. Any future column
-- edited-in-place there must be replayed here too, or the repair path drifts
-- from the fresh-migrate path on already-migrated databases.
CREATE TABLE IF NOT EXISTS session_referral_attributions (
  id           UUID        PRIMARY KEY DEFAULT uuidv7(),
  session_id   UUID        NOT NULL,
  -- ON DELETE SET NULL: preserve attribution history even if the referrer deletes their account.
  -- A null referrer_id means "referred by a deleted user" — the event still counts for analytics.
  referrer_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- ON DELETE SET NULL: preserve attribution records even if the attributed user deletes their account
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  landing_url  TEXT        NOT NULL,
  CHECK (char_length(landing_url) <= 2048),
  CHECK (referrer_id != user_id),

  -- UTM tracking parameters
  utm_source   TEXT,
  CONSTRAINT chk_sra_utm_source CHECK (utm_source IS NULL OR (char_length(utm_source) <= 255 AND utm_source = LOWER(TRIM(utm_source)))),
  utm_medium   TEXT,
  CONSTRAINT chk_sra_utm_medium CHECK (utm_medium IS NULL OR (char_length(utm_medium) <= 255 AND utm_medium = LOWER(TRIM(utm_medium)))),
  utm_campaign TEXT,
  CONSTRAINT chk_sra_utm_campaign CHECK (utm_campaign IS NULL OR (char_length(utm_campaign) <= 255 AND utm_campaign = LOWER(TRIM(utm_campaign)))),
  utm_content  TEXT,
  CONSTRAINT chk_sra_utm_content CHECK (utm_content IS NULL OR (char_length(utm_content) <= 255 AND utm_content = LOWER(TRIM(utm_content)))),

  signed_up_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
) PARTITION BY RANGE (id);

CREATE TABLE IF NOT EXISTS session_referral_attributions__default
PARTITION OF session_referral_attributions DEFAULT;

DO $$
BEGIN
  IF to_regclass('public.session_referral_attributions__legacy_nonpartitioned') IS NOT NULL THEN
    INSERT INTO session_referral_attributions (
      id,
      session_id,
      referrer_id,
      user_id,
      landing_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      signed_up_at
    )
    SELECT
      id,
      session_id,
      referrer_id,
      user_id,
      landing_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      signed_up_at
    FROM session_referral_attributions__legacy_nonpartitioned
    ON CONFLICT (id) DO UPDATE SET
      session_id = EXCLUDED.session_id,
      referrer_id = EXCLUDED.referrer_id,
      user_id = EXCLUDED.user_id,
      landing_url = EXCLUDED.landing_url,
      utm_source = EXCLUDED.utm_source,
      utm_medium = EXCLUDED.utm_medium,
      utm_campaign = EXCLUDED.utm_campaign,
      utm_content = EXCLUDED.utm_content,
      signed_up_at = EXCLUDED.signed_up_at;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__session_id_id
  ON session_referral_attributions (session_id, id);
CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__referrer_id
  ON session_referral_attributions (referrer_id)
  WHERE referrer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__user_id
  ON session_referral_attributions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE session_referral_attributions IS 'Tracks which user referred a session, linking anonymous sessions to referrers for attribution. RANGE-partitioned by id with a default partition only; split later by adding explicit range partitions.';
COMMENT ON COLUMN session_referral_attributions.session_id IS 'The anonymous session that was referred. Not a FK — sessions live outside PostgreSQL.';
COMMENT ON COLUMN session_referral_attributions.referrer_id IS 'The user who referred this session. NULL if the referrer deleted their account.';
COMMENT ON COLUMN session_referral_attributions.user_id IS 'The user who signed up from this referral. NULL until signup or if user deletes account.';
COMMENT ON COLUMN session_referral_attributions.landing_url IS 'The URL the referred session landed on (max 2048 chars).';
COMMENT ON COLUMN session_referral_attributions.utm_source IS 'UTM source parameter from the referral URL (e.g. google, newsletter).';
COMMENT ON COLUMN session_referral_attributions.utm_medium IS 'UTM medium parameter from the referral URL (e.g. cpc, email).';
COMMENT ON COLUMN session_referral_attributions.utm_campaign IS 'UTM campaign name from the referral URL.';
COMMENT ON COLUMN session_referral_attributions.utm_content IS 'UTM content parameter, used to differentiate links within the same campaign.';
COMMENT ON COLUMN session_referral_attributions.signed_up_at IS 'When the referred session converted to a signup. NULL until the user registers.';
