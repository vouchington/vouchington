/** Provisional two-bucket selection is not authority to mutate; history is re-read after locking. */
export const recoverableOAuthAuthorizationRowLocksSql = `/* getRecoverableOAuthAuthorizationIds:lock */
     WITH terminal_candidates AS (
       SELECT current_flow.id
       FROM oauth_authorizations flow
       JOIN view_oauth_authorization_current_records current_flow ON current_flow.id = flow.id
       WHERE flow.status IN ('callback_received', 'exchanging')
         AND flow.expires_at > CURRENT_TIMESTAMP
         AND ($5::uuid[] IS NULL OR flow.id = ANY($5::uuid[]))
         AND (
           (current_flow.status = 'exchanging'
             AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2))
           OR (
             current_flow.exchange_attempts >= $3
             AND (
               current_flow.status = 'callback_received'
               OR (
                 current_flow.status = 'exchanging'
                 AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
           )
           OR (
             current_flow.provider = 'x'
             AND (
               current_flow.status = 'callback_received'
               OR (
                 current_flow.status = 'exchanging'
                 AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
             AND current_flow.callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
           )
         )
       ORDER BY current_flow.id ASC
       LIMIT $1
       FOR UPDATE OF flow SKIP LOCKED
     ), retry_candidates AS (
     SELECT current_flow.id
     FROM oauth_authorizations flow
     JOIN view_oauth_authorization_current_records current_flow ON current_flow.id = flow.id
     WHERE flow.status IN ('callback_received', 'exchanging')
       AND flow.expires_at > CURRENT_TIMESTAMP
       AND ($5::uuid[] IS NULL OR flow.id = ANY($5::uuid[]))
       AND current_flow.exchange_attempts < $3
       AND (
         current_flow.provider <> 'x'
         OR current_flow.callback_received_at >
           CURRENT_TIMESTAMP - make_interval(secs => $4)
       )
       AND current_flow.status = 'callback_received'
     ORDER BY current_flow.id ASC
     LIMIT $1
     FOR UPDATE OF flow SKIP LOCKED
     ), candidate_ids AS (
       SELECT id FROM terminal_candidates UNION SELECT id FROM retry_candidates
     )
     SELECT flow.id
     FROM oauth_authorizations flow
     JOIN candidate_ids ON candidate_ids.id = flow.id
     ORDER BY flow.id ASC`
