import { read, write } from '@data-stores/psql'

export async function getTestOAuthConsentDecisions(
  clientId: string,
): Promise<Array<{ decision: 'approve' | 'deny'; resource: string; scopes: string[] }>> {
  const result = await read<{
    decision: 'approve' | 'deny'
    resource: string
    scopes: string[]
  }>(
    `/* getTestOAuthConsentDecisions */ SELECT
       CASE event_type
         WHEN 'consent_approved' THEN 'approve'
         WHEN 'consent_denied' THEN 'deny'
       END AS decision,
       resource,
       scopes::text[] AS scopes
     FROM oauth_authorization_server_events
     WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)
       AND event_type IN ('consent_approved', 'consent_denied')
     ORDER BY id`,
    [clientId],
  )
  return result.rows
}

export async function getTestOAuthLifecycleEvents(clientId: string): Promise<string[]> {
  const result = await read<{ event_type: string }>(
    `/* getTestOAuthLifecycleEvents */ SELECT event_type
     FROM oauth_authorization_server_events
     WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)
     ORDER BY id`,
    [clientId],
  )
  return result.rows.map(row => row.event_type)
}

export async function getTestNativeSessionMints(sessionId: string): Promise<
  Array<{
    user_id: string
    client_id: string
    grant_id: string
    session_id: string
    access_token_id: string
    attestation_status: 'attested' | 'unattested'
  }>
> {
  const result = await read<{
    user_id: string
    client_id: string
    grant_id: string
    session_id: string
    access_token_id: string
    attestation_status: 'attested' | 'unattested'
  }>(
    `/* getTestNativeSessionMints */ SELECT user_id, client_id, grant_id,
       session_id, access_token_id, attestation_status
     FROM oauth_native_session_token_mints
     WHERE session_id = $1 ORDER BY id`,
    [sessionId],
  )
  return result.rows
}

export async function mutateTestOAuthLifecycleEvent(
  clientId: string,
  mutation: 'delete' | 'update',
): Promise<void> {
  if (mutation === 'update') {
    await write(
      `/* mutateTestOAuthLifecycleEvent update */ UPDATE oauth_authorization_server_events
       SET resource = resource || '/changed'
       WHERE id = (
         SELECT id FROM oauth_authorization_server_events
         WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)
         ORDER BY id
         LIMIT 1
       )`,
      [clientId],
    )
    return
  }
  await write(
    `/* mutateTestOAuthLifecycleEvent delete */ DELETE FROM oauth_authorization_server_events
     WHERE id = (
       SELECT id FROM oauth_authorization_server_events
       WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)
       ORDER BY id
       LIMIT 1
     )`,
    [clientId],
  )
}
