-- This creator is deliberately after the follow relations, referral links, and
-- suspension history: every admission transition can now use one current rule.
CREATE OR REPLACE FUNCTION fn_refresh_user_engagement_email_candidates(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  candidate_type engagement_email_types;
  receipt_claimed_at TIMESTAMPTZ;
  receipt_terminal BOOLEAN;
  common_eligible BOOLEAN;
  eligible BOOLEAN;
BEGIN
  -- Serialize refreshes for different producer tables that affect one user.
  -- A concurrent transaction cannot commit a stale eligibility projection.
  -- Child inserts already hold FK KEY SHARE on the user. NO KEY UPDATE
  -- serializes refreshes without a lock-upgrade deadlock against that share.
  PERFORM 1 FROM users WHERE id = p_user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    DELETE FROM user_engagement_email_candidates WHERE user_id = p_user_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM users recipient
    JOIN user_email_addresses address
      ON address.user_id = recipient.id AND address.is_primary = TRUE
    WHERE recipient.id = p_user_id
      AND recipient.deleted_at IS NULL
      AND recipient.is_engagement_emails_enabled = TRUE
      AND recipient.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = recipient.id AND suspension.lifted_at IS NULL
      )
  ) INTO common_eligible;

  FOR candidate_type IN SELECT UNNEST(enum_range(NULL::engagement_email_types)) LOOP
    SELECT send.claimed_at,
           send.sent_at IS NOT NULL OR send.delivery_attempted_at IS NOT NULL
    INTO receipt_claimed_at, receipt_terminal
    FROM user_engagement_email_sends send
    WHERE send.user_id = p_user_id AND send.email_type = candidate_type;

    eligible := common_eligible AND NOT COALESCE(receipt_terminal, FALSE);

    IF candidate_type = 'follow_topics' THEN
      eligible := eligible AND NOT EXISTS (
        SELECT 1 FROM relation__user__follow__topic followed
        WHERE followed.subject_id = p_user_id AND followed.deleted_at IS NULL
      );
    ELSIF candidate_type = 'follow_news_sources' THEN
      eligible := eligible AND NOT EXISTS (
        SELECT 1 FROM relation__user__follow__rss_feed followed
        WHERE followed.subject_id = p_user_id AND followed.deleted_at IS NULL
      );
    ELSE
      eligible := eligible AND NOT EXISTS (
        SELECT 1 FROM user_referral_program_links link
        WHERE link.user_id = p_user_id
          AND link.deleted_at IS NULL AND link.activated_at IS NOT NULL
      );
    END IF;

    IF eligible THEN
      INSERT INTO user_engagement_email_candidates (user_id, email_type, claimed_at)
      VALUES (p_user_id, candidate_type, receipt_claimed_at)
      ON CONFLICT (email_type, user_id) DO UPDATE
        SET claimed_at = EXCLUDED.claimed_at
        WHERE user_engagement_email_candidates.claimed_at IS DISTINCT FROM EXCLUDED.claimed_at;
    ELSE
      DELETE FROM user_engagement_email_candidates
      WHERE user_id = p_user_id AND email_type = candidate_type;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION fn_refresh_user_engagement_email_candidates(UUID) IS 'Refreshes one live user across all three statically eligible engagement email types under a per-user row lock; the send receipt is authoritative and claim-hours remains a read-time predicate.';

CREATE OR REPLACE FUNCTION fn_update_user_engagement_email_candidates_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prior_user_id UUID;
  current_user_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    prior_user_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END;
    current_user_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END;
  ELSIF TG_TABLE_NAME LIKE 'relation__user__follow__topic%'
     OR TG_TABLE_NAME LIKE 'relation__user__follow__rss_feed%' THEN
    prior_user_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.subject_id ELSE NULL END;
    current_user_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.subject_id ELSE NULL END;
  ELSE
    prior_user_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id ELSE NULL END;
    current_user_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id ELSE NULL END;
  END IF;
  IF prior_user_id IS NOT NULL THEN
    PERFORM fn_refresh_user_engagement_email_candidates(prior_user_id);
  END IF;
  IF current_user_id IS NOT NULL AND current_user_id IS DISTINCT FROM prior_user_id THEN
    PERFORM fn_refresh_user_engagement_email_candidates(current_user_id);
  END IF;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION fn_update_user_engagement_email_candidates_trigger() IS 'Routes current user, primary-email, suspension, follow, referral-link, and send-receipt transitions to the one-user admission refresh.';

CREATE OR REPLACE TRIGGER trigger_users_engagement_email_candidates
AFTER UPDATE OF deleted_at, is_engagement_emails_enabled, processing_restricted_at OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_user_email_addresses_engagement_email_candidates
AFTER INSERT OR UPDATE OF user_id, is_primary OR DELETE ON user_email_addresses
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_user_suspensions_engagement_email_candidates
AFTER INSERT OR UPDATE OF user_id, lifted_at OR DELETE ON user_suspensions
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_follow_topics_engagement_email_candidates
AFTER INSERT OR UPDATE OF subject_id, deleted_at OR DELETE ON relation__user__follow__topic
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_follow_rss_feeds_engagement_email_candidates
AFTER INSERT OR UPDATE OF subject_id, deleted_at OR DELETE ON relation__user__follow__rss_feed
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_referral_links_engagement_email_candidates
AFTER INSERT OR UPDATE OF user_id, deleted_at, activated_at OR DELETE ON user_referral_program_links
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();

CREATE OR REPLACE TRIGGER trigger_engagement_email_sends_candidates
AFTER INSERT OR UPDATE OF user_id, email_type, claimed_at, delivery_attempted_at, sent_at OR DELETE
ON user_engagement_email_sends
FOR EACH ROW EXECUTE FUNCTION fn_update_user_engagement_email_candidates_trigger();
