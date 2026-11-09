import { write } from '@data-stores/psql'

/** Inspect only the synthetic actor's admission artifacts after a denied public flow. */
export async function getTestOAuthAdmissionArtifacts(userId: string) {
  const { rows } = await write<{
    requests: number
    approved_requests: number
    grants: number
    codes: number
    events: number
  }>(
    `/* getTestOAuthAdmissionArtifacts */ SELECT
       (SELECT count(*)::integer FROM oauth_authorization_requests WHERE user_id = $1) AS requests,
       (SELECT count(*)::integer FROM oauth_authorization_requests
         WHERE user_id = $1 AND approved_at IS NOT NULL) AS approved_requests,
       (SELECT count(*)::integer FROM oauth_grants WHERE user_id = $1) AS grants,
       (SELECT count(*)::integer FROM oauth_authorization_codes code
         JOIN oauth_grants ON oauth_grants.id = code.grant_id
         WHERE oauth_grants.user_id = $1) AS codes,
       (SELECT count(*)::integer FROM oauth_authorization_server_events WHERE user_id = $1) AS events`,
    [userId],
  )
  return rows[0]
}
