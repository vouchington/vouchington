/** A lost queue marker cannot establish whether a stale claim called its one-shot provider. */
export const rejectStaleOAuthAuthorizationExchangeSql = `/* rejectStaleOAuthAuthorizationExchange */
  WITH stale_claim AS (
    SELECT id, exchange_claim_id, updated_at,
      CASE WHEN provider = 'x' AND callback_received_at <=
        clock_timestamp() - make_interval(secs => $4) THEN 'provider_code_expired'
        WHEN exchange_attempts >= $3 THEN 'provider_exchange_failed'
        ELSE 'provider_exchange_outcome_unknown' END AS callback_error
    FROM view_oauth_authorization_current_records
    WHERE id = $1 AND status = 'exchanging' AND expires_at > clock_timestamp()
      AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
  )
  UPDATE oauth_authorizations flow
  SET rejected_at = COALESCE(flow.rejected_at, clock_timestamp()),
      callback_error = stale_claim.callback_error,
      callback_code_ciphertext = NULL, exchange_claim_id = NULL
  FROM stale_claim
  WHERE flow.id = stale_claim.id AND flow.status = 'callback_received'
    AND flow.updated_at = stale_claim.updated_at
    AND flow.exchange_claim_id IS NOT DISTINCT FROM stale_claim.exchange_claim_id`
