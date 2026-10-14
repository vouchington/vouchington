import type { TransactionQuery } from '@data-stores/psql'

export async function lockTestOAuthRetentionFirstRequest(
  clientId: string,
  query: TransactionQuery,
): Promise<void> {
  const { rowCount } = await query(
    `/* lockTestOAuthRetentionFirstRequest */ SELECT id FROM oauth_authorization_requests
     WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)
     ORDER BY expires_at, id LIMIT 1 FOR UPDATE`,
    [clientId],
  )
  if (rowCount !== 1) throw new Error('Test OAuth request is missing')
}
