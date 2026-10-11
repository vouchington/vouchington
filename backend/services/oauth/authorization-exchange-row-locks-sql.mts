/** Provisional two-bucket selection is not authority to mutate; history is re-read after locking. */
export const recoverableOAuthAuthorizationRowLocksSql = `/* getRecoverableOAuthAuthorizationIds:lock */
     WITH terminal_candidates AS (
       SELECT id
       FROM view_oauth_authorization_current_records
       WHERE expires_at > CURRENT_TIMESTAMP
         AND ($5::uuid[] IS NULL OR id = ANY($5::uuid[]))
         AND (
           (
             exchange_attempts >= $3
             AND (
               status = 'callback_received'
               OR (
                 status = 'exchanging'
                 AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
           )
           OR (
             provider = 'x'
             AND (
               status = 'callback_received'
               OR (
                 status = 'exchanging'
                 AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
             AND callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
           )
         )
       ORDER BY id ASC
       LIMIT $1
     ), retry_candidates AS (
     SELECT id
     FROM view_oauth_authorization_current_records
     WHERE expires_at > CURRENT_TIMESTAMP
       AND ($5::uuid[] IS NULL OR id = ANY($5::uuid[]))
       AND exchange_attempts < $3
       AND (
         provider <> 'x'
         OR callback_received_at >
           CURRENT_TIMESTAMP - make_interval(secs => $4)
       )
       AND (
         status = 'callback_received'
         OR (
           status = 'exchanging'
           AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
         )
       )
     ORDER BY id ASC
     LIMIT $1
     ), candidate_ids AS (
       SELECT id FROM terminal_candidates UNION SELECT id FROM retry_candidates
     )
     SELECT flow.id
     FROM oauth_authorizations flow
     JOIN candidate_ids ON candidate_ids.id = flow.id
     ORDER BY flow.id ASC
     FOR UPDATE OF flow SKIP LOCKED`
