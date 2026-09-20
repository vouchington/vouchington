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
       scopes
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

export async function mutateTestOAuthLifecycleEvent(
  clientId: string,
  mutation: 'delete' | 'update',
): Promise<void> {
  if (mutation === 'update') {
    await write(
      `/* mutateTestOAuthLifecycleEvent update */ UPDATE oauth_authorization_server_events
       SET resource = resource
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
