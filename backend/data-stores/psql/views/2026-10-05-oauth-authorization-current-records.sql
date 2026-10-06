CREATE OR REPLACE VIEW oauth_authorization_current_records AS
SELECT
  flow.id,
  flow.provider,
  flow.purpose,
  flow.callback_mode,
  CASE WHEN flow.status = 'callback_received' AND flow.exchange_claim_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM oauth_authorization_exchange_attempts attempt
      WHERE attempt.oauth_authorization_id = flow.id
        AND attempt.exchange_claim_id = flow.exchange_claim_id
        AND NOT EXISTS (
          SELECT 1 FROM oauth_authorization_exchange_attempt_results result
          WHERE result.oauth_authorization_exchange_attempt_id = attempt.id
        )
    ) THEN 'exchanging'::oauth_authorization_statuses ELSE flow.status END AS status,
  flow.initiating_user_id,
  flow.initiating_device_id,
  flow.initiating_session_id,
  flow.redirect_uri,
  flow.state_hash,
  flow.pkce_verifier_ciphertext,
  flow.completion_proof_challenge,
  flow.callback_code_ciphertext,
  flow.callback_error,
  flow.completion_token_hash,
  flow.completion_token_ciphertext,
  flow.facebook_user_id,
  flow.x_user_id,
  flow.github_user_id,
  flow.result_kind,
  flow.result_user_id,
  flow.result_device_id,
  flow.result_session_id,
  flow.login_attempt_id,
  flow.exchange_claim_id,
  flow.expires_at,
  flow.callback_received_at,
  (SELECT attempt.started_at FROM oauth_authorization_exchange_attempts attempt
   WHERE attempt.oauth_authorization_id = flow.id
   ORDER BY attempt.attempt_number DESC LIMIT 1) AS exchange_started_at,
  flow.completion_ready_at,
  flow.completed_at,
  flow.created_at,
  flow.updated_at,
  flow.rejected_at,
  flow.expired_at,
  COALESCE((SELECT MAX(attempt.attempt_number) FROM oauth_authorization_exchange_attempts attempt
    WHERE attempt.oauth_authorization_id = flow.id), 0)::smallint AS exchange_attempts
FROM oauth_authorizations flow;
COMMENT ON VIEW oauth_authorization_current_records IS 'Current OAuth lifecycle and active exchange projected from timestamp facts and immutable exchange history; outer row restrictions reach the authorization directly.';
