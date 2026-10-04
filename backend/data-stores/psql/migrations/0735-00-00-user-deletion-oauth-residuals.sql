-- Extend the final fenced proof without changing its existing ownership checks.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
    SELECT 1 FROM user_lists WHERE owner_user_id = target_user_id AND removed_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM bluesky_link_authorizations
    WHERE user_id = target_user_id
      AND status IN ('pending', 'callback_claimed', 'handoff_ready', 'attached')
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM bluesky_follow_records
    WHERE follower_user_id = target_user_id OR followee_user_id = target_user_id
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM user_data_requests
    WHERE user_id = target_user_id
      AND (
        (completed_at IS NULL AND failed_at IS NULL)
        OR (completed_at IS NOT NULL AND failed_at IS NULL AND s3_key IS NOT NULL)
      )
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM oauth_clients
    WHERE owner_user_id = target_user_id AND revoked_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM oauth_grants
    WHERE user_id = target_user_id AND revoked_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM oauth_refresh_token_families family
    JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id
    WHERE oauth_grant.user_id = target_user_id AND family.revoked_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM oauth_access_tokens access
    JOIN oauth_grants oauth_grant ON oauth_grant.id = access.grant_id
    WHERE oauth_grant.user_id = target_user_id AND access.revoked_at IS NULL
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1 FROM oauth_refresh_tokens refresh
    JOIN oauth_refresh_token_families family ON family.id = refresh.family_id
    JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id
    WHERE oauth_grant.user_id = target_user_id AND refresh.revoked_at IS NULL
  ) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION fn_user_deletion_has_remaining_owned_data(UUID) IS
  'Final fenced proof that no deletion-owned rows or active OAuth credentials remain before lifecycle completion.';
