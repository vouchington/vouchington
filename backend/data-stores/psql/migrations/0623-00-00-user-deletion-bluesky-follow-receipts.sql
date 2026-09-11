-- Keep every writer, including an old application process during a rolling deploy, serialized with
-- both users' deletion fences. The service takes the same locks before reaching this trigger so a
-- provider response fails before attempting the write on current deployments.
CREATE OR REPLACE FUNCTION fn_fence_bluesky_follow_receipt_active_users()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.follower_user_id <= NEW.followee_user_id THEN
    PERFORM fn_lock_active_user_for_mutation(NEW.follower_user_id);
    IF NEW.followee_user_id <> NEW.follower_user_id THEN
      PERFORM fn_lock_active_user_for_mutation(NEW.followee_user_id);
    END IF;
  ELSE
    PERFORM fn_lock_active_user_for_mutation(NEW.followee_user_id);
    PERFORM fn_lock_active_user_for_mutation(NEW.follower_user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_bluesky_follow_records_active_users
BEFORE INSERT OR UPDATE OF follower_user_id, followee_user_id ON bluesky_follow_records
FOR EACH ROW
EXECUTE FUNCTION fn_fence_bluesky_follow_receipt_active_users();

COMMENT ON FUNCTION fn_fence_bluesky_follow_receipt_active_users() IS
  'Prevents any Bluesky follow receipt writer from restoring user-owned data after deletion.';

-- Follow receipts created before the fence migration can remain after the bounded credential
-- cleanup batch. Finalization must retain the request until that residual receipt is removed.
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
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION fn_user_deletion_has_remaining_owned_data(UUID) IS
  'Final fenced proof that no deletion-owned database rows, including Bluesky follow receipts, remain before lifecycle completion.';
